import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  ORGANIZATION_APPROVAL_STATUSES,
  PURPOSES,
  ValidationError,
  type OrganizationSignupResponse,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import type {
  AuditProvider,
  Clock,
  IdGenerator,
  MembershipRepository,
  OrganizationRepository,
  UnitOfWork,
} from '@sentra/ports';

export interface OrgSignupActor {
  readonly userId: string;
  readonly label: string;
}

export interface OrgSignupInput {
  readonly organizationName: string;
  readonly organizationType: 'BANK' | 'TELECOM';
  readonly jurisdiction: string;
}

export interface OrgSignupDeps {
  readonly organizations: OrganizationRepository;
  readonly memberships: MembershipRepository;
  readonly unitOfWork: UnitOfWork;
  readonly audit: AuditProvider;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Default trading currency per jurisdiction; GBP is the pilot default for anything unmapped. */
const CURRENCY_BY_JURISDICTION: Record<string, string> = {
  GB: 'GBP',
  US: 'USD',
  IE: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  NG: 'NGN',
  KE: 'KES',
  ET: 'ETB',
};

/** Turns a display name into a slug that satisfies `organizationSlugSchema` (a-z start, 3–48). */
const baseSlug = (name: string): string => {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  const prefixed = /^[a-z]/.test(cleaned) ? cleaned : `org-${cleaned}`;
  const trimmed = prefixed.slice(0, 40).replace(/-+$/g, '');
  return trimmed.length >= 3 ? trimmed : `org-${trimmed}`.slice(0, 40);
};

/**
 * Self-service tenant signup. An authenticated but org-less user creates their own organization,
 * which lands in SANDBOX (the schema default) with the caller as its OWNER. Org creation, the
 * owner membership, and the audit entry all commit in one transaction.
 */
export class OrgSignup {
  public constructor(private readonly deps: OrgSignupDeps) {}

  public async execute(
    actor: OrgSignupActor,
    input: OrgSignupInput,
  ): Promise<OrganizationSignupResponse> {
    const jurisdiction = input.jurisdiction.toUpperCase();
    const defaultCurrency = CURRENCY_BY_JURISDICTION[jurisdiction] ?? 'GBP';
    const correlationId = getCorrelationId();

    return this.deps.unitOfWork.run(async (scope) => {
      const slug = await this.uniqueSlug(baseSlug(input.organizationName), scope);
      const now = this.deps.clock.now();

      const organization = await this.deps.organizations.create(
        {
          id: this.deps.ids.generate(),
          slug,
          legalName: input.organizationName,
          type: input.organizationType,
          jurisdiction,
          dataResidency: jurisdiction,
          defaultCurrency,
          createdBy: actor.userId,
          source: 'console-signup',
          correlationId,
        },
        scope,
      );

      await this.deps.memberships.create(
        {
          id: this.deps.ids.generate(),
          organizationId: organization.id,
          userId: actor.userId,
          role: 'OWNER',
          status: 'ACTIVE',
          invitedBy: null,
          activatedAt: now,
          correlationId,
        },
        scope,
      );

      await this.deps.audit.record(
        {
          organizationId: organization.id,
          actorType: ACTOR_TYPES.USER,
          actorId: actor.userId,
          actorLabel: actor.label,
          action: 'organization.signed_up',
          resourceType: 'organization',
          resourceId: organization.id,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          occurredAt: now,
          correlationId,
        },
        scope,
      );

      return {
        id: organization.id,
        slug: organization.slug,
        legalName: organization.legalName,
        type: organization.type,
        approvalStatus: ORGANIZATION_APPROVAL_STATUSES.SANDBOX,
        role: 'OWNER',
        createdAt: organization.createdAt.toISOString(),
      };
    });
  }

  /** Appends a short random suffix until the slug is free. Bounded so a pathological loop can't hang. */
  private async uniqueSlug(
    base: string,
    scope: Parameters<Parameters<UnitOfWork['run']>[0]>[0],
  ): Promise<string> {
    if ((await this.deps.organizations.findBySlug(base, scope)) === null) {
      return base;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = this.deps.ids.generate().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
      const candidate = `${base.slice(0, 40)}-${suffix}`.slice(0, 48);
      if ((await this.deps.organizations.findBySlug(candidate, scope)) === null) {
        return candidate;
      }
    }
    throw new ValidationError('Could not allocate a unique organization handle. Try a different name.');
  }
}

export const createOrgSignup = (deps: OrgSignupDeps): OrgSignup => new OrgSignup(deps);
