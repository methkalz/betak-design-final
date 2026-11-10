/**
 * ضبط سياسة إصدارات المتجر - للأدمن (الترحيل 20261111120001).
 * الخادم يرفض غير الأدمن، ويفرض: 0 ≤ الأدنى ≤ الأحدث، ومعرّف App Store أرقامٌ.
 */
import { supabase } from '@/lib/supabase';
import type { Result } from '@/providers/store';
import type { ReleasePolicy } from '@/domain/storeUpdate';

export type StorePlatform = 'ios' | 'android';

export async function fetchPolicyFor(platform: StorePlatform): Promise<Result<ReleasePolicy>> {
  const { data, error } = await supabase.rpc('app_release_policy', { p_platform: platform });
  if (error || !data) return { ok: false, error: error?.message ?? 'تعذّر التحميل.' };
  const d = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      latestBuild: Number(d.latest_build ?? 0) || 0,
      minBuild: Number(d.min_build ?? 0) || 0,
      iosAppStoreId: typeof d.ios_app_store_id === 'string' ? d.ios_app_store_id : null,
    },
  };
}

export async function savePolicyFor(
  platform: StorePlatform,
  latestBuild: number,
  minBuild: number,
  iosAppStoreId: string | null,
): Promise<Result> {
  const { error } = await supabase.rpc('set_app_release_policy', {
    p_platform: platform,
    p_latest_build: latestBuild,
    p_min_build: minBuild,
    p_ios_app_store_id: iosAppStoreId,
  });
  return error ? { ok: false, error: error.message } : { ok: true, data: undefined };
}
