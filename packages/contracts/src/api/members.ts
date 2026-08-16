/**
 * Console-facing member view. The request schemas (add by email/userId, update role) live in
 * `./organizations`; this adds the resolved user's email and display name so the members
 * screen can show a person rather than an opaque id.
 */
export interface MemberView {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly status: string;
  readonly createdAt: string;
  readonly activatedAt: string | null;
}

export interface MemberList {
  readonly items: readonly MemberView[];
}
