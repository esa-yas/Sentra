'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authEnabled } from './supabase/config';
import { createClient } from './supabase/client';
import { clearActiveOrg, readActiveOrg, writeActiveOrg } from './active-org';
import { getCurrentUser, postLogout, type AuthMembership, type MeResponse } from './api';

/**
 * How identity resolution ended.
 *
 * `error` is deliberately distinct from `ready`: a failed or unreachable `/auth/me` must never
 * be mistaken for "this user has no organization", which would wrongly push an established
 * operator into the create-organization flow. Callers act on `ready` only.
 */
export type SessionStatus = 'loading' | 'ready' | 'unauthenticated' | 'error';

interface SessionValue {
  readonly authEnabled: boolean;
  readonly loading: boolean;
  readonly status: SessionStatus;
  readonly user: MeResponse['user'] | null;
  readonly memberships: readonly AuthMembership[];
  readonly activeOrgId: string | null;
  readonly activeMembership: AuthMembership | null;
  readonly setActiveOrgId: (organizationId: string) => void;
  /** Whether the caller may act on `permission` in the active organization. */
  readonly hasPermission: (permission: string) => boolean;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(authEnabled);
  const [status, setStatus] = useState<SessionStatus>(authEnabled ? 'loading' : 'ready');
  const [user, setUser] = useState<MeResponse['user'] | null>(null);
  const [memberships, setMemberships] = useState<readonly AuthMembership[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  const setActiveOrgId = useCallback((organizationId: string) => {
    setActiveOrgIdState(organizationId);
    writeActiveOrg(organizationId);
  }, []);

  useEffect(() => {
    if (!authEnabled) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token === undefined) {
        // No session at all (signed out, or the refresh token finally expired).
        if (active) {
          setUser(null);
          setMemberships([]);
          setStatus('unauthenticated');
          setLoading(false);
        }
        return;
      }
      const me = await getCurrentUser(token);
      if (!active) return;

      if (me.data !== undefined) {
        setUser(me.data.user);
        setMemberships(me.data.memberships);
        const ids = me.data.memberships.map((membership) => membership.organizationId);
        const stored = readActiveOrg();
        const chosen = stored !== null && ids.includes(stored) ? stored : (ids[0] ?? null);
        if (chosen !== null) {
          setActiveOrgIdState(chosen);
          writeActiveOrg(chosen);
        }
        setStatus('ready');
      } else if (me.status === 401 || me.status === 403) {
        // The token is present but no longer accepted — treat it as signed out so the app
        // routes to the login page, never to onboarding.
        setUser(null);
        setMemberships([]);
        setStatus('unauthenticated');
      } else {
        // The API is unreachable or erroring. Keep whatever identity we already resolved and
        // report the failure; an unresolved session must not look like a missing organization.
        setStatus('error');
      }
      setLoading(false);
    };

    void load();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void load();
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const activeMembership = useMemo(
    () => memberships.find((membership) => membership.organizationId === activeOrgId) ?? null,
    [memberships, activeOrgId],
  );

  const hasPermission = useCallback(
    (permission: string): boolean => {
      // Demo mode (auth off) shows everything; otherwise gate on the active org's permissions.
      if (!authEnabled) return true;
      return activeMembership?.permissions.includes(permission) ?? false;
    },
    [activeMembership],
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token !== undefined) {
      await postLogout(token);
    }
    await supabase.auth.signOut();
    clearActiveOrg();
  }, []);

  const value: SessionValue = {
    authEnabled,
    loading,
    status,
    user,
    memberships,
    activeOrgId,
    activeMembership,
    setActiveOrgId,
    hasPermission,
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error('useSession must be used within a SessionProvider.');
  }
  return context;
}
