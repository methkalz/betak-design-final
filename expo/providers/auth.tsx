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
      // رسالة واحدة لكل إخفاق في المطابقة: تمرير نصّ الخادم كما هو يفرّق
      // بين «حساب غير موجود» و«كلمة سر خاطئة» فيصير الباب كشّافًا لمن
      // يجرّب الأرقام. ما لا علاقة له بالمطابقة (شبكة، انقطاع) يمرّ كما هو
      const m = error.message ?? '';
      const isCredentialish =
        /invalid login credentials|invalid grant|email not confirmed|user not found|not found|password/i.test(m);
      return {
        ok: false as const,
        error: isCredentialish ? 'رقم الهاتف أو كلمة السر غير صحيحة.' : m,
      };
    }
    return { ok: true as const };
  }, []);

  const signOutLive = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
  }, []);

  return { session, ready, liveConfigured, signInLive, signOutLive };
});
