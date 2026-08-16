import {
  ForbiddenError,
  resolveRolePermissions,
  resolveRolePurposes,
  type OrganizationMembershipSummary,
  type UserPrincipal,
} from '@sentra/contracts';
import type {
  Clock,
  IdGenerator,
  IdentityLinkRepository,
  MembershipRepository,
  UnitOfWork,
  UserRepository,
  UserTokenVerifier,
} from '@sentra/ports';

/**
 * Turns a verified portal token into a {@link UserPrincipal}.
 *
 * The token is verified first; only then does the use case resolve the person behind it. An
 * unknown-but-valid identity is provisioned just-in-time and linked to a platform user, but
 * is granted NO tenant access — membership is the only thing that authorizes a user against a
 * tenant's data (slide 073), so a brand-new sign-in produces a principal with zero
 * memberships until an administrator grants one. Find-or-create and the last-seen/last-used
 * stamps run inside one transaction so a login is recorded atomically.
 */
export interface ResolveUserPrincipalDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly unitOfWork: UnitOfWork;
  readonly verifier: UserTokenVerifier;
  readonly users: UserRepository;
  readonly identities: IdentityLinkRepository;
  readonly memberships: MembershipRepository;
}

export interface ResolvedUserSession {
  readonly principal: UserPrincipal;
  readonly profile: {
    readonly userId: string;
    readonly email: string;
    readonly displayName: string;
  };
  /** True when this sign-in provisioned a brand-new user record. */
  readonly provisioned: boolean;
}

/** Fallback address for a verified identity whose token carried no email claim. */
const FALLBACK_EMAIL_DOMAIN = 'users.noreply.sentra';

export const createResolveUserPrincipalUseCase = (deps: ResolveUserPrincipalDeps) => {
  const { clock, ids, unitOfWork, verifier, users, identities, memberships } = deps;

  const execute = async (rawToken: string): Promise<ResolvedUserSession> => {
    // Throws InvalidTokenError before any database work if the token is not trustworthy.
    const verified = await verifier.verify(rawToken);

    return unitOfWork.run(async (scope) => {
      const now = clock.now();
      const existingLink = await identities.findByIssuerAndSubject(
        verified.issuer,
        verified.subject,
        scope,
      );

      let userId: string;
      let provisioned = false;

      if (existingLink !== null) {
        userId = existingLink.userId;
        await identities.touchLastUsed(existingLink.id, now, scope);
      } else {
        const email = verified.email ?? `${verified.subject}@${FALLBACK_EMAIL_DOMAIN}`;
        const existingUser =
          verified.email === undefined ? null : await users.findByEmail(email, scope);
        if (existingUser !== null) {
          userId = existingUser.id;
        } else {
          userId = ids.generate();
          await users.create(
            {
              id: userId,
              primaryEmail: email,
              displayName: displayNameFor(email),
              source: 'supabase-auth',
            },
            scope,
          );
          provisioned = true;
        }
        await identities.create(
          { id: ids.generate(), userId, issuer: verified.issuer, subject: verified.subject },
          scope,
        );
      }

      await users.touchLastSeen(userId, now, scope);

      const user = await users.findById(userId, scope);
      if (user === null) {
        throw new ForbiddenError('The authenticated user could not be resolved.');
      }
      if (user.status !== 'ACTIVE') {
        // A suspended or deactivated account authenticates cryptographically but must not
        // receive a usable principal.
        throw new ForbiddenError('The authenticated user is not active.');
      }

      const activeMemberships = await memberships.listActiveForUser(userId, scope);
      const summaries: OrganizationMembershipSummary[] = activeMemberships.map((membership) => ({
        organizationId: membership.organizationId,
        organizationSlug: membership.organizationSlug,
        organizationType: membership.organizationType,
        role: membership.role,
        permissions: resolveRolePermissions(membership.role, membership.organizationType),
        purposes: resolveRolePurposes(membership.role),
      }));

      const principal: UserPrincipal = {
        id: userId,
        kind: 'USER',
        actorType: 'USER',
        // The audit label must never carry personal data, so it uses the app-owned id.
        label: `user:${userId}`,
        issuer: verified.issuer,
        subject: verified.subject,
        memberships: summaries,
      };

      return {
        principal,
        profile: { userId, email: user.primaryEmail, displayName: user.displayName },
        provisioned,
      };
    });
  };

  return { execute };
};

export type ResolveUserPrincipalUseCase = ReturnType<typeof createResolveUserPrincipalUseCase>;

const displayNameFor = (email: string): string => {
  const local = email.split('@')[0];
  return local === undefined || local === '' ? email : local;
};
