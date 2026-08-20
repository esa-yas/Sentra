import { z } from 'zod';
import {
  currencySchema,
  jurisdictionSchema,
  organizationApprovalStatusSchema,
  organizationSlugSchema,
  organizationStatusSchema,
  organizationTypeSchema,
} from '../organization';
import { memberRoleSchema, memberStatusSchema, permissionSchema } from '../authorization';
import { purposeSchema } from '../purpose';
import { ulidSchema } from '../identifiers';

export const createOrganizationRequestSchema = z
  .object({
    slug: organizationSlugSchema,
    legalName: z.string().min(2).max(200),
    type: organizationTypeSchema,
    jurisdiction: jurisdictionSchema,
    /** Where the tenant's data must remain. Defaults to the jurisdiction. */
    dataResidency: jurisdictionSchema.optional(),
    defaultCurrency: currencySchema.default('GBP'),
  })
  .strict();

export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

export const organizationResponseSchema = z.object({
  id: ulidSchema,
  slug: organizationSlugSchema,
  legalName: z.string(),
  type: organizationTypeSchema,
  status: organizationStatusSchema,
  jurisdiction: jurisdictionSchema,
  dataResidency: jurisdictionSchema,
  defaultCurrency: currencySchema,
  createdAt: z.string().datetime(),
});

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

/**
 * Self-service signup. An authenticated (but org-less) user creates their own tenant, which
 * lands in SANDBOX — production access is a separate, reviewed step. The applicant becomes the
 * OWNER. A human-readable name is supplied; the URL-safe slug is derived server-side.
 */
export const organizationSignupRequestSchema = z
  .object({
    organizationName: z.string().trim().min(2).max(80),
    /** Signups are for banks and telecoms; the PLATFORM tenant is never self-created. */
    organizationType: z.enum(['BANK', 'TELECOM']),
    jurisdiction: jurisdictionSchema.default('GB'),
  })
  .strict();

export type OrganizationSignupRequest = z.infer<typeof organizationSignupRequestSchema>;

export const organizationSignupResponseSchema = z.object({
  id: ulidSchema,
  slug: organizationSlugSchema,
  legalName: z.string(),
  type: organizationTypeSchema,
  approvalStatus: organizationApprovalStatusSchema,
  role: memberRoleSchema,
  createdAt: z.string().datetime(),
});

export type OrganizationSignupResponse = z.infer<typeof organizationSignupResponseSchema>;

export const updateOrganizationRequestSchema = z
  .object({
    legalName: z.string().min(2).max(200).optional(),
    status: organizationStatusSchema.optional(),
    defaultCurrency: currencySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided.' });

export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;

export const addMemberRequestSchema = z
  .object({
    /** Either an existing platform user, or an email address to invite. */
    userId: ulidSchema.optional(),
    email: z.string().email().max(254).optional(),
    role: memberRoleSchema,
  })
  .strict()
  .refine((value) => (value.userId === undefined) !== (value.email === undefined), {
    message: 'Provide exactly one of userId or email.',
  });

export type AddMemberRequest = z.infer<typeof addMemberRequestSchema>;

export const updateMemberRequestSchema = z
  .object({
    role: memberRoleSchema,
  })
  .strict();

export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const memberResponseSchema = z.object({
  id: ulidSchema,
  organizationId: ulidSchema,
  userId: ulidSchema,
  role: memberRoleSchema,
  status: memberStatusSchema,
  permissions: z.array(permissionSchema),
  purposes: z.array(purposeSchema),
  createdAt: z.string().datetime(),
  activatedAt: z.string().datetime().nullable(),
});

export type MemberResponse = z.infer<typeof memberResponseSchema>;

/** The caller's own identity and memberships, used by the console to render navigation. */
export const currentPrincipalResponseSchema = z.object({
  kind: z.enum(['USER', 'PARTNER', 'SYSTEM']),
  id: ulidSchema,
  label: z.string(),
  memberships: z.array(
    z.object({
      organizationId: ulidSchema,
      organizationSlug: organizationSlugSchema,
      organizationType: organizationTypeSchema,
      role: memberRoleSchema,
      permissions: z.array(permissionSchema),
      purposes: z.array(purposeSchema),
    }),
  ),
});

export type CurrentPrincipalResponse = z.infer<typeof currentPrincipalResponseSchema>;
