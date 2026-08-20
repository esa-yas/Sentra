import {
  ACTOR_TYPES,
  AUDIT_OUTCOMES,
  NotFoundError,
  ORGANIZATION_APPROVAL_STATUSES,
  PURPOSES,
  ValidationError,
  type GoLiveRequestResponse,
  type OrganizationDetailResponse,
} from '@sentra/contracts';
import { getCorrelationId } from '@sentra/observability';
import type {
  AuditProvider,
  Clock,
  OrganizationRecord,
  OrganizationRepository,
  UnitOfWork,
} from '@sentra/ports';

export interface OrgAdminActor {
  readonly userId: string;
  readonly label: string;
}

export interface OrgAdminDeps {
  readonly organizations: OrganizationRepository;
  readonly unitOfWork: UnitOfWork;
  readonly audit: AuditProvider;
  readonly clock: Clock;
}

const toDetail = (org: OrganizationRecord): OrganizationDetailResponse => ({
  id: org.id,
  slug: org.slug,
  legalName: org.legalName,
  type: org.type,
  jurisdiction: org.jurisdiction,
  defaultCurrency: org.defaultCurrency,
  approvalStatus: org.approvalStatus,
  createdAt: org.createdAt.toISOString(),
});

/** Organization self-management: read the tenant's own record and request production access. */
export class OrgAdmin {
  public constructor(private readonly deps: OrgAdminDeps) {}

  public async getCurrent(organizationId: string): Promise<OrganizationDetailResponse> {
    const org = await this.deps.organizations.findById(organizationId);
    if (org === null) {
      throw new NotFoundError('organization', organizationId);
    }
    return toDetail(org);
  }

  /**
   * Moves the tenant from SANDBOX (or a prior DECLINED decision) into PENDING_REVIEW. Approving
   * or declining is a PLATFORM-side action, so this only submits the request — it never grants
   * production access itself.
   */
  public async requestGoLive(
    organizationId: string,
    actor: OrgAdminActor,
  ): Promise<GoLiveRequestResponse> {
    return this.deps.unitOfWork.run(async (scope) => {
      const org = await this.deps.organizations.findById(organizationId, scope);
      if (org === null) {
        throw new NotFoundError('organization', organizationId);
      }
      const canRequest =
        org.approvalStatus === ORGANIZATION_APPROVAL_STATUSES.SANDBOX ||
        org.approvalStatus === ORGANIZATION_APPROVAL_STATUSES.DECLINED;
      if (!canRequest) {
        throw new ValidationError(
          org.approvalStatus === ORGANIZATION_APPROVAL_STATUSES.APPROVED
            ? 'This organization is already approved for production.'
            : 'A production-access request is already under review.',
        );
      }

      const now = this.deps.clock.now();
      await this.deps.organizations.update(
        organizationId,
        { approvalStatus: ORGANIZATION_APPROVAL_STATUSES.PENDING_REVIEW, approvalUpdatedAt: now },
        scope,
      );
      await this.deps.audit.record(
        {
          organizationId,
          actorType: ACTOR_TYPES.USER,
          actorId: actor.userId,
          actorLabel: actor.label,
          action: 'organization.go_live_requested',
          resourceType: 'organization',
          resourceId: organizationId,
          purpose: PURPOSES.PARTNER_ADMINISTRATION,
          outcome: AUDIT_OUTCOMES.ALLOWED,
          occurredAt: now,
          correlationId: getCorrelationId(),
        },
        scope,
      );

      return { approvalStatus: ORGANIZATION_APPROVAL_STATUSES.PENDING_REVIEW };
    });
  }
}

export const createOrgAdmin = (deps: OrgAdminDeps): OrgAdmin => new OrgAdmin(deps);
