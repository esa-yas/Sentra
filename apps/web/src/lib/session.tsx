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

interface SessionValue {
  readonly authEnabled: boolean;
  readonly loading: boolean;
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
        if (active) {
          setUser(null);
          setMemberships([]);
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
