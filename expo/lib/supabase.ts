/**
 * عميل Supabase — شريحة الربط الأولى.
 *
 * - القيم من expo/.env المتجاهَل في git (EXPO_PUBLIC_* آمنة للعميل بطبيعتها:
 *   الـURL عام ومفتاح anon مصمم للتوزيع، والحماية الحقيقية في RLS).
 * - schema: 'api' — السطح الوحيد المعروض؛ core وprivate غير قابلين للنداء.
 * - الجلسات في مخزن مشفّر: مفتاح AES-256 في SecureStore (المخزن الآمن
 *   للنظام) والحمولة المشفرة في AsyncStorage — وصفة Supabase الموثقة
 *   لأن SecureStore وحده يقصّ القيم فوق 2048 بايت على أندرويد.
 */
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

class LargeSecureStore {
  private async encryptionKey(storageKey: string): Promise<Uint8Array> {
    const keyName = `${storageKey.replaceAll(/\W/g, '_')}_aes`;
    const existing = await SecureStore.getItemAsync(keyName);
    if (existing) return aesjs.utils.hex.toBytes(existing);
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    await SecureStore.setItemAsync(keyName, aesjs.utils.hex.fromBytes(fresh));
    return fresh;
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    try {
      const aesKey = await this.encryptionKey(key);
      const cipher = new aesjs.ModeOfOperation.ctr(aesKey, new aesjs.Counter(1));
      const decrypted = cipher.decrypt(aesjs.utils.hex.toBytes(encrypted));
      return aesjs.utils.utf8.fromBytes(decrypted);
    } catch {
      // مفتاح مفقود/تالف ← الجلسة غير قابلة للاسترجاع؛ دخول جديد أنظف من انهيار
      await AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const aesKey = await this.encryptionKey(key);
    const cipher = new aesjs.ModeOfOperation.ctr(aesKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(encrypted));
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true عندما تكون قيم البيئة مضبوطة — الوضع الحي غير متاح بدونها. */
export const liveConfigured = url.length > 0 && anonKey.length > 0;

export const supabase = createClient(url || 'http://localhost', anonKey || 'anon', {
  db: { schema: 'api' },
  auth: {
    storage: Platform.OS === 'web' ? undefined : new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// تجديد الرمز يعمل والتطبيق في المقدمة فقط — نمط Supabase الموصى به لـRN
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
