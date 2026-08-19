import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  NotFoundError,
  PURPOSES,
  ValidationError,
  type MemberList,
  type MemberRole,
  type MemberView,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import type {
  AuditProvider,
  Clock,
  IdGenerator,
  MembershipRecord,
  MembershipRepository,
  UnitOfWork,
  UserRecord,
  UserRepository,
} from '@sentra/ports';

/** The administrator performing a change — for audit provenance and invited-by attribution. */
export interface MemberActor {
  readonly userId: string;
  readonly label: string;
}

export interface MemberAdminDeps {
  readonly memberships: MembershipRepository;
  readonly users: UserRepository;
  readonly unitOfWork: UnitOfWork;
  readonly audit: AuditProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const toView = (membership: MembershipRecord, user: UserRecord | null): MemberView => ({
  id: membership.id,
  userId: membership.userId,
  email: user?.primaryEmail ?? 'unknown',
  displayName: user?.displayName ?? 'unknown',
  role: membership.role,
  status: membership.status,
  createdAt: membership.createdAt.toISOString(),
  activatedAt: membership.activatedAt?.toISOString() ?? null,
});

/**
 * Human member administration for one organization. Every mutation is tenant-scoped, records
 * to the organization's audit chain in the same transaction, and refuses to remove or demote
 * the last owner — a tenant with no owner is unrecoverable without platform intervention.
 */
export class MemberAdmin {
  public constructor(private readonly deps: MemberAdminDeps) {}

  public async list(organizationId: string): Promise<MemberList> {
    const page = await this.deps.memberships.listForOrganization(organizationId, { limit: 200 });
    const items = await Promise.all(
      page.items.map(async (membership) => {
        const user = await this.deps.users.findById(membership.userId);
        return toView(membership, user);
      }),
    );
    return { items };
  }

  public async addByEmail(
    organizationId: string,
    email: string,
    role: MemberRole,
    actor: MemberActor,
  ): Promise<MemberView> {
    return this.deps.unitOfWork.run(async (scope) => {
      const user = await this.deps.users.findByEmail(email, scope);
      if (user === null) {
        throw new ValidationError('No user with that email has signed in yet, so they cannot be added.');
      }
      const existing = await this.deps.memberships.findByOrganizationAndUser(
        organizationId,
        user.id,
        scope,
      );
      if (existing !== null) {
        throw new ValidationError('That user is already a member of this organization.');
      }
      const membership = await this.deps.memberships.create(
        {
          id: this.deps.ids.generate(),
          organizationId,
          userId: user.id,
          role,
          status: 'ACTIVE',
          invitedBy: actor.userId,
          activatedAt: this.deps.clock.now(),
          correlationId: getCorrelationId(),
        },
        scope,
      );
      await this.record(organizationId, actor, 'member.added', membership.id, scope);
      return toView(membership, user);
    });
  }

  public async changeRole(
    organizationId: string,
    membershipId: string,
    role: MemberRole,
    actor: MemberActor,
  ): Promise<MemberView> {
    return this.deps.unitOfWork.run(async (scope) => {
      const membership = await this.requireMembership(organizationId, membershipId, scope);
      if (membership.role === 'OWNER' && role !== 'OWNER') {
        await this.assertNotLastOwner(organizationId, scope);
      }
      const updated = await this.deps.memberships.updateRole(membershipId, role, scope);
      await this.record(organizationId, actor, 'member.role_changed', membershipId, scope);
      const user = await this.deps.users.findById(updated.userId, scope);
      return toView(updated, user);
    });
  }

  public async remove(
    organizationId: string,
    membershipId: string,
    actor: MemberActor,
  ): Promise<void> {
    await this.deps.unitOfWork.run(async (scope) => {
      const membership = await this.requireMembership(organizationId, membershipId, scope);
      if (membership.role === 'OWNER') {
        await this.assertNotLastOwner(organizationId, scope);
      }
      await this.deps.memberships.updateStatus(membershipId, 'REMOVED', this.deps.clock.now(), scope);
      await this.record(organizationId, actor, 'member.removed', membershipId, scope);
    });
  }

  private async requireMembership(
    organizationId: string,
    membershipId: string,
    scope: Parameters<Parameters<UnitOfWork['run']>[0]>[0],
  ): Promise<MembershipRecord> {
    const membership = await this.deps.memberships.findById(membershipId, scope);
    if (membership === null || membership.organizationId !== organizationId) {
      throw new NotFoundError('member', membershipId);
    }
    return membership;
  }

  private async assertNotLastOwner(
    organizationId: string,
    scope: Parameters<Parameters<UnitOfWork['run']>[0]>[0],
  ): Promise<void> {
    const owners = await this.deps.memberships.countActiveByRole(organizationId, 'OWNER', scope);
    if (owners <= 1) {
      throw new ValidationError('Cannot remove or demote the last owner of an organization.');
    }
  }

  private async record(
    organizationId: string,
    actor: MemberActor,
    action: string,
    membershipId: string,
    scope: Parameters<Parameters<UnitOfWork['run']>[0]>[0],
  ): Promise<void> {
    await this.deps.audit.record(
      {
        organizationId,
        actorType: ACTOR_TYPES.USER,
        actorId: actor.userId,
        actorLabel: actor.label,
        action,
        resourceType: 'organization_member',
        resourceId: membershipId,
        purpose: PURPOSES.PARTNER_ADMINISTRATION,
        outcome: AUDIT_OUTCOMES.ALLOWED,
        occurredAt: this.deps.clock.now(),
        correlationId: getCorrelationId(),
      },
      scope,
    );
  }
}

export const createMemberAdmin = (deps: MemberAdminDeps): MemberAdmin => new MemberAdmin(deps);
