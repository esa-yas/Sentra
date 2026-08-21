import type { SessionStatus } from './session';

export interface AuthRouteInput {
  readonly authEnabled: boolean;
  readonly status: SessionStatus;
  readonly hasUser: boolean;
  readonly membershipCount: number;
}

/**
 * Decides where a console visitor must be sent, or `null` to stay put.
 *
 * The rule that matters: onboarding (`/signup`) is only ever reached from a *successful*
 * identity resolution that genuinely reported zero organizations. An expired or rejected
 * session goes to `/login`, and an unresolved one (API down, still loading) goes nowhere —
 * "we could not ask" is not the same as "this user has no organization", and conflating the
 * two is what dropped returning operators onto the create-organization screen.
 */
export const resolveAuthRoute = (input: AuthRouteInput): '/login' | '/signup' | null => {
  if (!input.authEnabled) {
    return null;
  }
  if (input.status === 'unauthenticated') {
    return '/login';
  }
  if (input.status === 'ready' && input.hasUser && input.membershipCount === 0) {
    return '/signup';
  }
  return null;
};
