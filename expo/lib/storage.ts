/**
 * رفع المرفقات إلى مخزن الخادم وعرضها بروابط موقّتة.
 *
 * المسار منظَّم <org>/<project>/<id>.<ext> - السياسات على الخادم تنطق
 * من المسار نفسه، فلا رفع خارج مؤسستك ولا خارج مشروعٍ تراه.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { supabase } from './supabase';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

export function attachmentExt(uri: string): string {
  const raw = (uri.split('?')[0].split('.').pop() ?? '').toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(raw) && CONTENT_TYPES[raw] ? raw : 'jpg';
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function uploadAttachmentFile(
  path: string,
  localUri: string,
): Promise<{ ok: true; byteSize: number } | { ok: false; error: string }> {
  try {
    // الويب لا يملك نظام ملفات: روابط blob:/data: تُقرأ بـfetch مباشرة
    let buffer: ArrayBuffer;
    if (Platform.OS === 'web') {
      buffer = await (await fetch(localUri)).arrayBuffer();
    } else {
      const b64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      buffer = base64ToBytes(b64).buffer as ArrayBuffer;
    }
    const ext = attachmentExt(path);
    const { error } = await supabase.storage.from('attachments').upload(path, buffer, {
      contentType: CONTENT_TYPES[ext],
      upsert: false,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, byteSize: buffer.byteLength };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'تعذر قراءة الملف.' };
  }
}

/**
 * روابط العرض الموقّتة، بذاكرة جلسة: المسار الواحد يوقَّع مرة كل ساعة لا
 * مع كل ظهور للصورة في القوائم.
 */
const signedCache = new Map<string, { url: string; expiresAt: number }>();

export async function signedAttachmentUrl(storagePath: string): Promise<string | null> {
  const hit = signedCache.get(storagePath);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('attachments').createSignedUrl(storagePath, 3600);
  if (!data?.signedUrl) return null;
  signedCache.set(storagePath, { url: data.signedUrl, expiresAt: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}
