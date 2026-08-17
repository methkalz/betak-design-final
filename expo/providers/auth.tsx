/**
 * جلسة Supabase — شريحة الربط الأولى.
 * يدير session فقط (دخول/خروج/استرجاع تلقائي)؛ بيانات التطبيق تُجلب في
 * lib/live.ts وتُصب في المتجر. منفصل عن StoreProvider كي لا تتشابك الدورات.
 */
import createContextHook from '@nkzw/create-context-hook';
import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { phoneIdentityEmail } from '@/lib/phone';
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

  /** الدخول برقم الهاتف: الرقم يُطبَّع ثم يُشتق منه بريد الهوية. */
  const signInLive = useCallback(async (phone: string, password: string) => {
    const identity = phoneIdentityEmail(phone);
    if (!identity) {
      return { ok: false as const, error: 'رقم الهاتف غير صحيح - مثال: 0526444414' };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: identity,
      password,
    });
    if (error) {
      const msg =
        error.message === 'Invalid login credentials'
          ? 'رقم الهاتف أو كلمة السر غير صحيحة.'
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
