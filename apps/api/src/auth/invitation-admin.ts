import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  INVITATION_STATUSES,
  NotFoundError,
  PURPOSES,
  ValidationError,
  type AcceptInvitationResponse,
  type InvitationCreatedResponse,
  type InvitationListResponse,
  type InvitationPreview,
  type InvitationView,
  type MemberRole,
} from '@sentra/contracts';
import { renderInvitationEmail } from '@sentra/adapters';
import { getCorrelationId, type Logger } from '@sentra/observability';
import { createHash, randomBytes } from 'node:crypto';
import type {
  AuditProvider,
  Clock,
  EmailSender,
  IdGenerator,
  InvitationRecord,
  InvitationRepository,
  MembershipRepository,
  OrganizationRepository,
  UnitOfWork,
  UserRepository,
} from '@sentra/ports';

export interface InvitationActor {
  readonly userId: string;
  readonly label: string;
  /** Shown as the sender in the invitation email, when known. */
  readonly displayName?: string;
}

/** Sends the invitation email. Returns false when no mail could be sent. */
export type InvitationMailer = (input: {
  readonly email: string;
  readonly acceptUrl: string;
  readonly organizationName: string;
  readonly role: MemberRole;
  readonly inviterName?: string;
}) => Promise<boolean>;

export interface InvitationAdminDeps {
  readonly invitations: InvitationRepository;
  readonly memberships: MembershipRepository;
  readonly organizations: OrganizationRepository;
  readonly users: UserRepository;
  readonly unitOfWork: UnitOfWork;
  readonly audit: AuditProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly consoleBaseUrl: string;
  readonly sendMail: InvitationMailer;
}

/** Invitations are valid for one week. */
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

const lookupOf = (token: string): string => createHash('sha256').update(token).digest('hex');

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

const toView = (record: InvitationRecord): InvitationView => ({
  id: record.id,
  email: record.email,
  role: record.role,
  status: record.status,
  createdAt: record.createdAt.toISOString(),
  expiresAt: record.expiresAt.toISOString(),
});

/**
 * Invitation administration.
 *
 * The invitation row is the sole authority on which organization and role an invitee receives —
 * never anything carried on the invitee's own profile, which they can edit. Acceptance is
 * matched on the authenticated email, so a forwarded link cannot be redeemed by someone else.
 */
export class InvitationAdmin {
  public constructor(private readonly deps: InvitationAdminDeps) {}

  public async list(organizationId: string): Promise<InvitationListResponse> {
    const records = await this.deps.invitations.listForOrganization(organizationId);
    return { items: records.map(toView) };
  }

  public async invite(
    organizationId: string,
    actor: InvitationActor,
    input: { email: string; role: MemberRole },
  ): Promise<InvitationCreatedResponse> {
    const email = normaliseEmail(input.email);
    const organization = await this.deps.organizations.findById(organizationId);
    if (organization === null) {
      throw new NotFoundError('organization', organizationId);
    }

    // Someone who is already a member does not need an invitation.
    const existingUser = await this.deps.users.findByEmail(email);
    if (existingUser !== null) {
      const membership = await this.deps.memberships.findByOrganizationAndUser(
        organizationId,
        existingUser.id,
      );
      if (membership !== null && membership.status !== 'REMOVED') {
        throw new ValidationError('That person is already a member of this organization.');
      }
    }

    const token = randomBytes(32).toString('base64url');
    const now = this.deps.clock.now();
    const correlationId = getCorrelationId();

    const record = await this.deps.unitOfWork.run(async (scope) => {
      const created = await this.deps.invitations.create(
        {
          id: this.deps.ids.generate(),
          organizationId,
          email,
          role: input.role,
          tokenLookup: lookupOf(token),
          invitedBy: actor.userId,
          expiresAt: new Date(now.getTime() + TTL_MS),
          correlationId,
        },
        scope,
      );
      await this.record(organizationId, actor, 'member.invited', created.id, scope);
      return created;
    });

    const acceptUrl = `${this.deps.consoleBaseUrl}/invite?token=${encodeURIComponent(token)}`;
    const emailSent = await this.deps
      .sendMail({
        email,
        acceptUrl,
        organizationName: organization.legalName,
        role: input.role,
        ...(actor.displayName === undefined ? {} : { inviterName: actor.displayName }),
      })
      .catch((error: unknown) => {
        this.deps.logger.warn('invitation_email_failed', {
          invitationId: record.id,
          correlationId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
        return false;
      });

    return { invitation: toView(record), emailSent, acceptUrl };
  }

  /** What the invitee is shown before they accept. Never reveals the token or the inviter. */
  public async preview(token: string): Promise<InvitationPreview> {
    const record = await this.requirePending(token);
    const organization = await this.deps.organizations.findById(record.organizationId);
    if (organization === null) {
      throw new NotFoundError('organization', record.organizationId);
    }
    return {
      email: record.email,
      role: record.role,
      organizationName: organization.legalName,
      organizationType: organization.type,
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  /**
   * Redeems an invitation for the authenticated caller. The caller's verified email must match
   * the invited address, so forwarding the link to someone else does not grant them access.
   */
  public async accept(
    token: string,
    caller: { userId: string; email: string; label: string },
    fullName: string,
  ): Promise<AcceptInvitationResponse> {
    const record = await this.requirePending(token);
    if (normaliseEmail(caller.email) !== record.email) {
      throw new ValidationError(
        'This invitation was issued to a different email address. Sign in with the invited address to accept it.',
      );
    }

    const organization = await this.deps.organizations.findById(record.organizationId);
    if (organization === null) {
      throw new NotFoundError('organization', record.organizationId);
    }

    return this.deps.unitOfWork.run(async (scope) => {
      const now = this.deps.clock.now();
      const existing = await this.deps.memberships.findByOrganizationAndUser(
        record.organizationId,
        caller.userId,
        scope,
      );
      if (existing === null) {
        await this.deps.memberships.create(
          {
            id: this.deps.ids.generate(),
            organizationId: record.organizationId,
            userId: caller.userId,
            role: record.role,
            status: 'ACTIVE',
            invitedBy: record.invitedBy,
            activatedAt: now,
            correlationId: getCorrelationId(),
          },
          scope,
        );
      } else if (existing.status !== 'ACTIVE') {
        await this.deps.memberships.updateStatus(existing.id, 'ACTIVE', now, scope);
      }

      // The invitee chooses how their name appears; the email and organization are fixed.
      await this.deps.users.updateDisplayName(caller.userId, fullName.trim(), scope);
      await this.deps.invitations.updateStatus(
        record.id,
        INVITATION_STATUSES.ACCEPTED,
        now,
        scope,
      );
      await this.record(
        record.organizationId,
        { userId: caller.userId, label: caller.label },
        'member.invitation_accepted',
        record.id,
        scope,
      );

      return {
        organizationId: organization.id,
        organizationName: organization.legalName,
        role: record.role,
      };
    });
  }

  public async revoke(
    organizationId: string,
    invitationId: string,
    actor: InvitationActor,
  ): Promise<InvitationView> {
    return this.deps.unitOfWork.run(async (scope) => {
      const records = await this.deps.invitations.listForOrganization(organizationId, scope);
      const record = records.find((candidate) => candidate.id === invitationId);
      if (record === undefined) {
        throw new NotFoundError('invitation', invitationId);
      }
      const updated = await this.deps.invitations.updateStatus(
        invitationId,
        INVITATION_STATUSES.REVOKED,
        this.deps.clock.now(),
        scope,
      );
      await this.record(organizationId, actor, 'member.invitation_revoked', invitationId, scope);
      return toView(updated);
    });
  }

  /** Resolves a token to a usable invitation, or explains why it cannot be used. */
  private async requirePending(token: string): Promise<InvitationRecord> {
    const record = await this.deps.invitations.findByTokenLookup(lookupOf(token));
    if (record === null) {
      throw new NotFoundError('invitation', 'token');
    }
    if (record.status === INVITATION_STATUSES.ACCEPTED) {
      throw new ValidationError('This invitation has already been accepted.');
    }
    if (record.status === INVITATION_STATUSES.REVOKED) {
      throw new ValidationError('This invitation was revoked.');
    }
    if (record.expiresAt.getTime() <= this.deps.clock.now().getTime()) {
      throw new ValidationError('This invitation has expired. Ask an administrator for a new one.');
    }
    return record;
  }

  private async record(
    organizationId: string,
    actor: InvitationActor,
    action: string,
    invitationId: string,
    scope: Parameters<Parameters<UnitOfWork['run']>[0]>[0],
  ): Promise<void> {
    await this.deps.audit.record(
      {
        organizationId,
        actorType: ACTOR_TYPES.USER,
        actorId: actor.userId,
        actorLabel: actor.label,
        action,
        resourceType: 'organization_invitation',
        resourceId: invitationId,
        purpose: PURPOSES.PARTNER_ADMINISTRATION,
        outcome: AUDIT_OUTCOMES.ALLOWED,
        occurredAt: this.deps.clock.now(),
        correlationId: getCorrelationId(),
      },
      scope,
    );
  }
}

export const createInvitationAdmin = (deps: InvitationAdminDeps): InvitationAdmin =>
  new InvitationAdmin(deps);

/**
 * Sends the invitation through the configured {@link EmailSender}, rendered with the shared
 * branded template. Returns false when no mail could be sent, so the caller can surface the
 * accept link instead of implying an email arrived.
 */
export const createInvitationMailer =
  (sender: EmailSender, expiresInDays: number): InvitationMailer =>
  async ({ email, acceptUrl, organizationName, role, inviterName }) => {
    const rendered = renderInvitationEmail({
      organizationName,
      role,
      acceptUrl,
      expiresInDays,
      ...(inviterName === undefined ? {} : { inviterName }),
    });
    return sender.send({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  };
