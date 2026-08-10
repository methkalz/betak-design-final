/**
 * جلسة Supabase — شريحة الربط الأولى.
 * يدير session فقط (دخول/خروج/استرجاع تلقائي)؛ بيانات التطبيق تُجلب في
 * lib/live.ts وتُصب في المتجر. منفصل عن StoreProvider كي لا تتشابك الدورات.
 */
import createContextHook from '@nkzw/create-context-hook';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { liveConfigured, supabase } from '@/lib/supabase';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInLive = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const msg =
        error.message === 'Invalid login credentials'
          ? 'بريد أو كلمة سر غير صحيحة.'
          : error.message;
      return { ok: false as const, error: msg };
    }
    return { ok: true as const };
  }, []);

  const signOutLive = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
  }, []);

  return { session, ready, liveConfigured, signInLive, signOutLive };
});
