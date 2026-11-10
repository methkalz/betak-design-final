/**
 * «يتوفر تحديث» - واجهات الجهاز والخادم.
 *
 * ثلاث حالاتٍ لا يُفحص فيها شيء، وكلّها تعيد null فلا يُعرض شيء:
 *   - الويب: يُحدَّث برفع الموقع، لا متجر له.
 *   - Expo Go: رقم البناء رقمُ Expo Go نفسه لا رقم تطبيقنا.
 *   - رقمٌ غير مقروء.
 *
 * ونافذة التحديث داخل التطبيق (expo-in-app-updates) وحدةٌ أصليّة غائبة عن
 * Expo Go وعن البناء الذي لا يحملها، فتُحمَّل عند الحاجة داخل try - وغيابها
 * يعود إلى رابط المتجر.
 */
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { parseBuild, storeLinks, type ReleasePolicy } from '@/domain/storeUpdate';
import { supabase } from '@/lib/supabase';

type InAppUpdates = typeof import('expo-in-app-updates');

export const STORE_PLATFORM: 'ios' | 'android' | null =
  Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;

/** رقم بناء التطبيق المثبَّت، أو null حيث لا معنى للفحص. */
export function installedBuild(): number | null {
  if (!STORE_PLATFORM) return null;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null; // Expo Go
  return parseBuild(Application.nativeBuildVersion);
}

export async function fetchReleasePolicy(): Promise<ReleasePolicy | null> {
  if (!STORE_PLATFORM) return null;
  const { data, error } = await supabase.rpc('app_release_policy', { p_platform: STORE_PLATFORM });
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    latestBuild: Number(d.latest_build ?? 0) || 0,
    minBuild: Number(d.min_build ?? 0) || 0,
    iosAppStoreId: typeof d.ios_app_store_id === 'string' ? d.ios_app_store_id : null,
  };
}

function loadInAppUpdates(): InAppUpdates | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-in-app-updates') as InAppUpdates;
  } catch {
    return null;
  }
}

/** هل يعلن المتجر نفسه نسخةً أحدث؟ (أندرويد من Google Play، وiOS من App Store) */
export async function storeHasNewer(): Promise<boolean> {
  const mod = loadInAppUpdates();
  if (!mod) return false;
  try {
    const info = await mod.checkForUpdate();
    return !!info.updateAvailable;
  } catch {
    return false;
  }
}

/**
 * زرّ «تحديث»:
 *   أندرويد: نافذة Google Play داخل التطبيق (فوريّة للإلزاميّ، وفي الخلفية
 *            للاختياريّ). وإن تعذّرت (تطبيقٌ لم يُثبَّت من Play) فصفحته في المتجر.
 *   iOS: صفحة التطبيق في App Store فوق الشاشة، وإلا فتطبيق المتجر.
 */
export async function openStoreUpdate(required: boolean, iosAppStoreId: string | null): Promise<boolean> {
  if (!STORE_PLATFORM) return false;
  const mod = loadInAppUpdates();
  if (mod) {
    try {
      if (await mod.startUpdate(required)) return true;
    } catch {
      // إلى رابط المتجر
    }
  }
  for (const url of storeLinks(STORE_PLATFORM, iosAppStoreId)) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // الرابط التالي
    }
  }
  return false;
}
