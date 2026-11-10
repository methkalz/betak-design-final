/**
 * الإشعار العامّ - نداءات الخادم (الترحيل 20261110120001).
 * الخادم يرفض غير الأدمن، ويعدّ المستلمين، ويحفظ السجلّ.
 */
import { supabase } from '@/lib/supabase';
import type { Result } from '@/providers/store';
import type { Role } from '@/types/domain';

export interface SentAnnouncement {
  id: string;
  title: string;
  body: string;
  roles: Role[] | null;
  recipients: number;
  readCount: number;
  pushed: number;
  delivered: number;
  senderName: string;
  createdAt: string;
}

export async function sendAnnouncement(
  title: string,
  body: string,
  roles: Role[],
  idempotencyKey: string,
): Promise<Result<{ recipients: number }>> {
  const { data, error } = await supabase.rpc('send_announcement', {
    p_title: title.trim(),
    p_body: body.trim(),
    p_roles: roles.length ? roles : null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { recipients: Number((data as { recipients?: number })?.recipients ?? 0) } };
}

export async function fetchRecentAnnouncements(): Promise<Result<SentAnnouncement[]>> {
  const { data, error } = await supabase.rpc('recent_announcements');
  if (error) return { ok: false, error: error.message };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ''),
      body: String(r.body ?? ''),
      roles: (r.roles as Role[] | null) ?? null,
      recipients: Number(r.recipients ?? 0),
      readCount: Number(r.read_count ?? 0),
      pushed: Number(r.pushed ?? 0),
      delivered: Number(r.delivered ?? 0),
      senderName: String(r.sender_name ?? ''),
      createdAt: String(r.created_at ?? ''),
    })),
  };
}
