import { z } from 'zod';
import { memberRoleSchema } from '../authorization';
import { organizationTypeSchema } from '../organization';
import { ulidSchema } from '../identifiers';

/**
 * Invitations.
 *
 * An administrator invites a person by email; the invitation record — never the invitee's own
 * profile — decides which organization and role they receive. The emailed token is shown once
 * and only its SHA-256 is stored, exactly as with API-key secrets.
 */
export const INVITATION_STATUSES = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
} as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[keyof typeof INVITATION_STATUSES];

export const invitationStatusSchema = z.enum([
  INVITATION_STATUSES.PENDING,
  INVITATION_STATUSES.ACCEPTED,
  INVITATION_STATUSES.REVOKED,
  INVITATION_STATUSES.EXPIRED,
]);

export const createInvitationRequestSchema = z
  .object({
    email: z.string().email().max(254),
    role: memberRoleSchema,
  })
  .strict();

export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationViewSchema = z.object({
  id: ulidSchema,
  email: z.string(),
  role: memberRoleSchema,
  status: invitationStatusSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type InvitationView = z.infer<typeof invitationViewSchema>;

export const invitationListResponseSchema = z.object({
  items: z.array(invitationViewSchema),
});

export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

/**
 * Returned when an administrator creates an invitation. `emailSent` reports whether the invite
 * mail actually went out; when it did not, `acceptUrl` lets the administrator pass the link on
 * by hand rather than leaving the invitee stranded.
 */
export const invitationCreatedResponseSchema = z.object({
  invitation: invitationViewSchema,
  emailSent: z.boolean(),
  acceptUrl: z.string(),
});

export type InvitationCreatedResponse = z.infer<typeof invitationCreatedResponseSchema>;

/** The public preview an invitee sees before accepting: who invited them, and to what. */
export const invitationPreviewSchema = z.object({
  email: z.string(),
  role: memberRoleSchema,
  organizationName: z.string(),
  organizationType: organizationTypeSchema,
  expiresAt: z.string().datetime(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationRequestSchema = z
  .object({
    token: z.string().min(16).max(256),
    /** Recorded as the member's display name. The email and organization are not negotiable. */
    fullName: z.string().trim().min(2).max(80),
  })
  .strict();

export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const acceptInvitationResponseSchema = z.object({
  organizationId: ulidSchema,
  organizationName: z.string(),
  role: memberRoleSchema,
});

export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
