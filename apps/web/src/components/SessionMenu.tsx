'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authEnabled } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import { getCurrentUser, postLogout } from '@/lib/api';

/**
 * Shows the signed-in user and a sign-out control. Renders nothing when auth is not
 * configured (open demo mode) or before a session resolves. The email comes from the API's
 * verified `/auth/me`, not from the raw token, so what the badge shows is what the server
 * actually authorized.
 */
export function SessionMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authEnabled) {
      return;
    }
    const supabase = createClient();
    let active = true;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token === undefined) {
        if (active) setEmail(null);
        return;
      }
      const me = await getCurrentUser(token);
      if (active) setEmail(me.data?.user.email ?? null);
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

  if (!authEnabled || email === null) {
    return null;
  }

  const signOut = async () => {
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token !== undefined) {
      await postLogout(token);
    }
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300">
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-60"
      >
        Sign out
      </button>
    </div>
  );
}
