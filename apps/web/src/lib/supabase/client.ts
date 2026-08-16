'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from './config';

/**
 * Browser-side Supabase client. Only ever constructed when auth is configured; callers guard
 * on {@link authEnabled} first. Sessions are stored in cookies by @supabase/ssr so the edge
 * middleware can read them on the next request.
 */
export const createClient = () => {
  if (!authEnabled) {
    throw new Error('Supabase authentication is not configured.');
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
};
