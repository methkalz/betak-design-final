import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildSeed, SEED_VERSION, type Database } from '@/data/seed';
import {
  finishedWindowIds,
  pickRolls,
  projectFabricGaps,
  windowFabricNeed,
  type FabricGap,
} from '@/domain/fabricPlan';
import { canConsume, canReserve, rollBalance } from '@/domain/inventory';
import {
  PROJECT_STATUS_LABELS,
  TAILOR_STAGE_LABELS,
  TAILOR_STAGE_ORDER,
} from '@/domain/labels';
import type { AssignmentKind } from '@/domain/assignment';
import { can, ROLE_LABELS, type Capability } from '@/domain/permissions';
import { computeTotals, priceWindow, round3 } from '@/domain/pricing';
import { uid } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import type {
  Attachment,
  BusinessSettings,
  AttachmentKind,
  ClientOperation,
  Customer,
  FabricKind,
  FabricProduct,
  FabricVariant,
  FieldVisit,
  MovementType,
  NotificationKind,
  PaymentKind,
  PaymentMethod,
  Priority,
  Profile,
  Project,
  ProjectStatus,
  QuotationItem,
  QuotationVersion,
  Role,
  Room,
  TailorStage,
  UUID,
  VisitType,
  WindowUnit,
} from '@/types/domain';

const DB_KEY = `baytak.db.${SEED_VERSION}`;

/**
 * إماهة محصَّنة: اللقطة المخزَّنة تُدمج فوق شكل البذرة الطازج، فأي مصفوفة
 * أُضيفت إلى النموذج بعد حفظ اللقطة تمتلئ بقيمتها الابتدائية بدل أن تصل
 * `undefined` وتُسقط أول شاشة تقرؤها. بدون هذا، نسيان رفع SEED_VERSION مع
 * إضافة حقل = تطبيق لا يفتح عند كل من يحمل لقطة قديمة.
 */
function reviveDb(raw: string): Database {
  const fresh = buildSeed();
  const parsed = JSON.parse(raw) as Partial<Database>;
  return {
    ...fresh,
    ...parsed,
    // الإعدادات كائن لا مصفوفة، فدمج السطح الأول وحده يستبدلها كاملةً بالقديمة
    // ويصل رقم تسعيرة جديد إلى المحرك `undefined`: عرض سعر بـ NaN لا خطأ يُرى.
    settings: { ...fresh.settings, ...(parsed.settings ?? {}) },
  } as Database;
}
const SESSION_KEY = 'baytak.session';

export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'offline' | 'permission' | 'validation' | 'conflict' };

const fail = (error: string, code?: Result['ok'] extends false ? never : never): Result<never> =>
  ({ ok: false, error }) as Result<never>;

function failWith(error: string, code: 'offline' | 'permission' | 'validation' | 'conflict'): Result<never> {
  return { ok: false, error, code };
}

const okVoid: Result<void> = { ok: true, data: undefined };

/** Simulates the round-trip to a Supabase RPC. Server-authoritative operations
 *  are rejected while offline — they are never optimistically applied. */
function serverLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 550));
}

export const [StoreProvider, useStore] = createContextHook(() => {
  const [db, setDb] = useState<Database>(() => buildSeed());
  const [userId, setUserId] = useState<UUID | null>(null);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [busy, setBusy] = useState<string | null>(null);
  /** demo = بيانات محلية تجريبية؛ live = قاعدة الخادم الحقيقية (شريحة القراءة). */
  const [source, setSource] = useState<'demo' | 'live'>('demo');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawDb, rawSession] = await Promise.all([
          AsyncStorage.getItem(DB_KEY),
          AsyncStorage.getItem(SESSION_KEY),
        ]);
        if (cancelled) return;
        if (rawDb) {
          setDb(reviveDb(rawDb));
        }
        if (rawSession) setUserId(JSON.parse(rawSession) as string);
      } catch (e) {
        console.log('[store] hydrate failed, falling back to seed', e);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // الوضع الحي لا يُحفظ محليًا: الحقيقة عند الخادم، وإعادة الفتح تجلبها من جديد
    if (source === 'live') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(DB_KEY, JSON.stringify(db)).catch((e) =>
        console.log('[store] persist failed', e),
      );
    }, 350);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [db, hydrated, source]);

  useEffect(() => {
    if (!hydrated) return;
    if (source === 'live') return; // جلسة الوضع الحي يديرها Supabase (مخزن مشفر)
    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(userId)).catch(() => {});
  }, [userId, hydrated, source]);

  const currentUser = useMemo<Profile | null>(
    () => db.profiles.find((p) => p.id === userId) ?? null,
    [db.profiles, userId],
  );
  const role: Role = currentUser?.role ?? 'field';

  const mutate = useCallback((fn: (draft: Database) => void) => {
    setDb((prev) => {
      const next: Database = JSON.parse(JSON.stringify(prev)) as Database;
      fn(next);
      return next;
    });
  }, []);

  const audit = useCallback(
    (draft: Database, action: string, entity: string, entityId: string, summary: string) => {
      draft.auditLogs.unshift({
        id: uid('aud'),
        organizationId: draft.organization.id,
        actorId: userId ?? 'system',
        action,
        entity,
        entityId,
        summary,
        createdAt: new Date().toISOString(),
      });
    },
    [userId],
  );

  const notify = useCallback(
    (
      draft: Database,
      target: UUID,
      kind: NotificationKind,
      title: string,
      body: string,
      deepLink: string | null,
    ) => {
      draft.notifications.unshift({
        id: uid('ntf'),
        organizationId: draft.organization.id,
        userId: target,
        kind,
        title,
        body,
        deepLink,
        readAt: null,
        createdAt: new Date().toISOString(),
      });
    },
    [],
  );

  const enqueue = useCallback(
    (draft: Database, kind: string, label: string, entityId: string) => {
      const op: ClientOperation = {
        id: uid('op'),
        clientOperationId: uid('cop'),
        idempotencyKey: uid('idem'),
        kind,
        label,
        entityId,
        state: 'pending',
        attempts: 0,
        error: null,
        createdAt: new Date().toISOString(),
        syncedAt: null,
      };
      draft.operations.unshift(op);
    },
    [],
  );

  /** Drains the offline queue whenever connectivity returns. */
  useEffect(() => {
    if (!hydrated || !isOnline) return;
    const pending = db.operations.filter((o) => o.state === 'pending' || o.state === 'failed');
    if (pending.length === 0) return;
    const ids = pending.map((o) => o.id);
    const t1 = setTimeout(() => {
      mutate((draft) => {
        draft.operations = draft.operations.map((o) =>
          ids.includes(o.id) ? { ...o, state: 'syncing', attempts: o.attempts + 1 } : o,
        );
      });
    }, 400);
    const t2 = setTimeout(() => {
      mutate((draft) => {
        draft.operations = draft.operations.map((o) =>
          ids.includes(o.id)
            ? { ...o, state: 'synced', error: null, syncedAt: new Date().toISOString() }
            : o,
        );
        draft.attachments = draft.attachments.map((a) => ({ ...a, uploaded: true }));
      });
    }, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isOnline, hydrated, db.operations, mutate]);

  const guard = useCallback(
    (capability: Capability): Result<void> | null => {
      if (!currentUser) return failWith('الجلسة منتهية - يرجى تسجيل الدخول.', 'permission');
      if (!can(currentUser.role, capability))
        return failWith('لا تملك صلاحية تنفيذ هذه العملية.', 'permission');
      return null;
    },
    [currentUser],
  );

  const requireOnline = useCallback((): Result<void> | null => {
    if (!isOnline)
      return failWith(
        'هذه عملية خادمية (RPC) ولا يمكن تأكيدها دون اتصال. سيتم تنفيذها عند عودة الشبكة.',
        'offline',
      );
    return null;
  }, [isOnline]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const signIn = useCallback(
    async (profileId: UUID, pin: string): Promise<Result<void>> => {
      const profile = db.profiles.find((p) => p.id === profileId);
      if (!profile) return failWith('المستخدم غير موجود.', 'validation');
      if (!profile.isActive) return failWith('الحساب غير مفعّل.', 'permission');
      await serverLatency();
      if (profile.pin !== pin) return failWith('رمز الدخول غير صحيح.', 'validation');
      setUserId(profile.id);
      return okVoid;
    },
    [db.profiles],
  );

  // ── الوضع الحي (شريحة الربط الأولى — قراءة) ──────────────────────────────
  const enterLive = useCallback((liveDb: Database, liveUserId: UUID) => {
    setSource('live');
    setDb(liveDb);
    setUserId(liveUserId);
  }, []);

  const exitLive = useCallback(async () => {
    setSource('demo');
    setUserId(null);
    try {
      const rawDb = await AsyncStorage.getItem(DB_KEY);
      setDb(rawDb ? reviveDb(rawDb) : buildSeed());
    } catch {
      setDb(buildSeed());
    }
  }, []);

  const signOut = useCallback(() => {
    if (source === 'live') {
      void supabase.auth.signOut().catch(() => {});
      void exitLive();
      return;
    }
    setUserId(null);
  }, [source, exitLive]);

  // ── Customers ─────────────────────────────────────────────────────────────
  const createCustomer = useCallback(
    (input: Pick<Customer, 'fullName' | 'phone' | 'city' | 'address' | 'notes'>): Result<string> => {
      const denied = guard('manage_customers');
      if (denied) return denied as Result<string>;
      if (input.fullName.trim().length < 3)
        return failWith('اسم الزبون قصير جدًا.', 'validation');
      if (!/^0\d{1,2}-?\d{7}$/.test(input.phone.replace(/\s/g, '')))
        return failWith('رقم الهاتف غير صالح (مثال: 052-6444414).', 'validation');
      const id = uid('cus');
      mutate((draft) => {
        draft.customers.unshift({
          id,
          organizationId: draft.organization.id,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          city: input.city.trim(),
          address: input.address.trim(),
          notes: input.notes.trim(),
          preferences: [],
          createdAt: new Date().toISOString(),
          archivedAt: null,
        });
        audit(draft, 'customer.create', 'customer', id, `إنشاء زبون: ${input.fullName}`);
      });
      return { ok: true, data: id };
    },
    [guard, mutate, audit],
  );

  const updateCustomer = useCallback(
    (id: UUID, patch: Partial<Customer>): Result<void> => {
      const denied = guard('manage_customers');
      if (denied) return denied;
      mutate((draft) => {
        draft.customers = draft.customers.map((c) => (c.id === id ? { ...c, ...patch } : c));
        audit(draft, 'customer.update', 'customer', id, 'تحديث بيانات الزبون');
      });
      return okVoid;
    },
    [guard, mutate, audit],
  );

  const archiveCustomer = useCallback(
    (id: UUID): Result<void> => {
      const denied = guard('manage_customers');
      if (denied) return denied;
      mutate((draft) => {
        draft.customers = draft.customers.map((c) =>
          c.id === id ? { ...c, archivedAt: new Date().toISOString() } : c,
        );
        audit(draft, 'customer.archive', 'customer', id, 'أرشفة الزبون (بدون حذف فعلي)');
      });
      return okVoid;
    },
    [guard, mutate, audit],
  );

  // ── Projects ──────────────────────────────────────────────────────────────
  const createProject = useCallback(
    (input: {
      customerId: UUID;
      title: string;
      priority: Priority;
      measurementWorkerId: UUID | null;
      installerId: UUID | null;
      tailorId: UUID | null;
      measurementDate: string | null;
      notes: string;
    }): Result<string> => {
      const denied = guard('manage_customers');
      if (denied) return denied as Result<string>;
      if (input.title.trim().length < 3) return failWith('عنوان المشروع قصير جدًا.', 'validation');
      // الخياط والقائس إلزاميان: مشروعٌ بلا منفّذ يقف عند أول مرحلة عمل،
      // ومشروعٌ بلا قائس لا تُفتح له زيارة فلا تُسجَّل مقاسات أصلًا. الإلزام
      // في الإنشاء أرحم من الوقوف في الوسط. أما المركّب فيؤجَّل عمدًا -
      // التركيب بعيد وقد لا يُعرف اليوم من يفرغ له.
      const tailor = db.profiles.find((p) => p.id === input.tailorId);
      if (!tailor || tailor.role !== 'tailor' || !tailor.isActive)
        return failWith('اختر الخياط المسؤول - إلزامي لكل مشروع.', 'validation');
      const measurer = db.profiles.find((p) => p.id === input.measurementWorkerId);
      if (!measurer || measurer.role !== 'field' || !measurer.isActive)
        return failWith('اختر من سيقوم بالقياس - إلزامي لكل مشروع.', 'validation');
      if (input.installerId) {
        const inst = db.profiles.find((p) => p.id === input.installerId);
        if (!inst || inst.role !== 'field' || !inst.isActive)
          return failWith('عامل التركيب المختار غير مفعَّل.', 'validation');
      }
      const id = uid('prj');
      mutate((draft) => {
        const number = 1046 + draft.projects.length;
        const project: Project = {
          id,
          organizationId: draft.organization.id,
          customerId: input.customerId,
          code: `BD-${number}`,
          title: input.title.trim(),
          status: input.measurementDate ? 'awaiting_measurement' : 'new_request',
          priority: input.priority,
          measurementWorkerId: input.measurementWorkerId,
          installerId: input.installerId,
          tailorId: input.tailorId,
          measurementDate: input.measurementDate,
          installationDate: null,
          notes: input.notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lockVersion: 1,
        };
        draft.projects.unshift(project);
        if (input.measurementWorkerId && input.measurementDate) {
          const visitId = uid('fv');
          draft.fieldVisits.unshift({
            id: visitId,
            organizationId: draft.organization.id,
            projectId: id,
            assigneeId: input.measurementWorkerId,
            type: 'measurement',
            status: 'scheduled',
            scheduledAt: input.measurementDate,
            startedAt: null,
            completedAt: null,
            notes: '',
            checklist: { track: false, curtain: false, height: false, cleanliness: false },
            customerSignedOff: false,
          });
          notify(
            draft,
            input.measurementWorkerId,
            'visit_assigned',
            'زيارة قياس جديدة',
            `${project.title} - ${project.code}`,
            `/visit/${visitId}`,
          );
        }
        audit(draft, 'project.create', 'project', id, `إنشاء مشروع ${project.code}`);
      });
      return { ok: true, data: id };
    },
    [guard, mutate, audit, notify],
  );

  const updateProject = useCallback(
    (id: UUID, patch: Partial<Project>): Result<void> => {
      mutate((draft) => {
        draft.projects = draft.projects.map((p) =>
          p.id === id
            ? { ...p, ...patch, updatedAt: new Date().toISOString(), lockVersion: p.lockVersion + 1 }
            : p,
        );
        audit(draft, 'project.update', 'project', id, 'تحديث بيانات المشروع');
      });
      return okVoid;
    },
    [mutate, audit],
  );

  const setProjectStatus = useCallback(
    (id: UUID, status: ProjectStatus): Result<void> => {
      // قرار المرحلة بيد الأدمن وحده - كانت الشاشة وحدها من يحرس
      const denied = guard('manage_users');
      if (denied) return denied;
      mutate((draft) => {
        const project = draft.projects.find((p) => p.id === id);
        if (!project) return;
        project.status = status;
        project.updatedAt = new Date().toISOString();
        project.lockVersion += 1;
        audit(
          draft,
          'project.status',
          'project',
          id,
          `تحديث حالة ${project.code} إلى: ${PROJECT_STATUS_LABELS[status]}`,
        );
        const readyTarget = project.installerId ?? project.measurementWorkerId;
        if (status === 'ready_for_install' && readyTarget) {
          notify(
            draft,
            readyTarget,
            'ready_for_install',
            'جاهز للتركيب',
            `${project.title} جاهز - حدد الموعد.`,
            `/project/${id}`,
          );
        }
      });
      return okVoid;
    },
    [guard, mutate, audit, notify],
  );

  /**
   * إسناد دور على مشروع قائم (M16) - قياسًا أو تركيبًا أو خياطةً.
   *
   * الإسناد صريح بيد الأدمن ويقبل التبديل في أي وقت: من يقيس ليس بالضرورة
   * من يركّب، والتركيب قد يُقرَّر بعد أسابيع حين يُعرف من يفرغ له.
   *
   * وتبديل القائس يُحوَّل معه زيارة القياس المفتوحة، وإلا بقيت باسم من لم
   * يعد مسؤولًا فيراها في قائمته ولا يراها صاحبها الجديد.
   */
  const assignRole = useCallback(
    (projectId: UUID, workerId: UUID, kind: AssignmentKind): Result<void> => {
      const denied = guard('manage_users');
      if (denied) return denied;
      const worker = db.profiles.find((p) => p.id === workerId);
      const wanted: Role = kind === 'tailor' ? 'tailor' : 'field';
      if (!worker || worker.role !== wanted || !worker.isActive)
        return failWith(
          kind === 'tailor' ? 'اختر خياطًا مفعَّلًا.' : 'اختر عاملًا ميدانيًا مفعَّلًا.',
          'validation',
        );
      mutate((draft) => {
        const project = draft.projects.find((p) => p.id === projectId);
        if (!project) return;
        project.updatedAt = new Date().toISOString();

        if (kind === 'tailor') {
          project.tailorId = workerId;
          const open = draft.tailorAssignments.find(
            (a) => a.projectId === projectId && a.stage !== 'ready',
          );
          if (open) open.tailorId = workerId;
        } else if (kind === 'measurement') {
          project.measurementWorkerId = workerId;
          const visit = draft.fieldVisits.find(
            (v) => v.projectId === projectId && v.type === 'measurement' && v.status !== 'completed',
          );
          if (visit) {
            visit.assigneeId = workerId;
          } else if (
            project.measurementDate &&
            (project.status === 'new_request' || project.status === 'awaiting_measurement')
          ) {
            draft.fieldVisits.unshift({
              id: uid('fv'),
              organizationId: draft.organization.id,
              projectId,
              assigneeId: workerId,
              type: 'measurement',
              status: 'scheduled',
              scheduledAt: project.measurementDate,
              startedAt: null,
              completedAt: null,
              notes: '',
              checklist: { track: false, curtain: false, height: false, cleanliness: false },
              customerSignedOff: false,
            });
          }
        } else {
          project.installerId = workerId;
          const visit = draft.fieldVisits.find(
            (v) =>
              v.projectId === projectId && v.type === 'installation' && v.status !== 'completed',
          );
          if (visit) visit.assigneeId = workerId;
        }

        const label =
          kind === 'tailor' ? 'الخياطة' : kind === 'measurement' ? 'القياس' : 'التركيب';
        notify(
          draft,
          workerId,
          kind === 'tailor' ? 'tailor_assignment' : 'visit_assigned',
          `أُسند إليك ${label}`,
          `${project.title} - ${project.code}`,
          `/project/${projectId}`,
        );
        audit(
          draft,
          'project.assign',
          'project',
          projectId,
          `إسناد ${label} إلى ${worker.fullName}`,
        );
      });
      return okVoid;
    },
    [guard, db.profiles, mutate, notify, audit],
  );

  // ── Rooms & windows (offline-first) ───────────────────────────────────────
  /**
   * إنشاء حساب موظف.
   *
   * الرمز السرّي يدخله الأدمن هنا لأنه لا يوجد بريد ولا رسائل في هذا السياق -
   * الخياط أو العامل يستلمه شفهيًا ويغيّره لاحقًا. أربعة أرقام لا أقل: أقصر
   * من ذلك يجعل التخمين مسألة دقائق على جهاز مشترك في المعرض.
   */
  const createProfile = useCallback(
    (input: { fullName: string; phone: string; role: Role; title: string; pin: string }): Result<string> => {
      const denied = guard('manage_users');
      if (denied) return denied as Result<string>;
      if (!input.fullName.trim()) return failWith('اسم الموظف مطلوب.', 'validation');
      if (!/^0\d{1,2}-?\d{7}$/.test(input.phone.replace(/\s/g, '')))
        return failWith('رقم الهاتف غير صحيح.', 'validation');
      if (!/^\d{4}$/.test(input.pin)) return failWith('الرمز أربعة أرقام.', 'validation');
      if (db.profiles.some((p) => p.phone.replace(/\D/g, '') === input.phone.replace(/\D/g, '')))
        return failWith('يوجد حساب بهذا الرقم بالفعل.', 'conflict');
      const id = uid('usr');
      mutate((draft) => {
        draft.profiles.push({
          id,
          organizationId: draft.organization.id,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          role: input.role,
          pin: input.pin,
          title: input.title.trim() || ROLE_LABELS[input.role],
          isActive: true,
        });
        enqueue(draft, 'profile.create', `إضافة موظف: ${input.fullName.trim()}`, id);
        audit(draft, 'profile.create', 'profile', id, `إضافة ${ROLE_LABELS[input.role]}: ${input.fullName.trim()}`);
      });
      return { ok: true, data: id };
    },
    [guard, db.profiles, mutate, enqueue, audit],
  );

  /**
   * التعطيل لا الحذف: الموظف الذي غادر مذكورٌ في مشاريع وحركات مخزون لا يجوز
   * أن تفقد فاعلها. التعطيل يُخرجه من قوائم الإسناد ويُبقي تاريخه سليمًا.
   */
  const setProfileActive = useCallback(
    (profileId: UUID, active: boolean): Result<void> => {
      const denied = guard('manage_users');
      if (denied) return denied;
      if (profileId === userId && !active)
        return failWith('لا يمكنك تعطيل حسابك أنت.', 'validation');
      mutate((draft) => {
        const p = draft.profiles.find((x) => x.id === profileId);
        if (!p) return;
        p.isActive = active;
        audit(
          draft,
          active ? 'profile.activate' : 'profile.deactivate',
          'profile',
          profileId,
          `${active ? 'تفعيل' : 'تعطيل'} حساب ${p.fullName}`,
        );
      });
      return okVoid;
    },
    [guard, userId, mutate, audit],
  );

  const addRoom = useCallback(
    (projectId: UUID, name: string, floor: string): Result<string> => {
      const denied = guard('enter_measurements');
      if (denied) return denied as Result<string>;
      if (!name.trim()) return failWith('اسم الغرفة مطلوب.', 'validation');
      const id = uid('rm');
      mutate((draft) => {
        const count = draft.rooms.filter((r) => r.projectId === projectId).length;
        const room: Room = {
          id,
          organizationId: draft.organization.id,
          projectId,
          name: name.trim(),
          floor: floor.trim(),
          sortOrder: count + 1,
        };
        draft.rooms.push(room);
        enqueue(draft, 'room.create', `إضافة غرفة: ${room.name}`, id);
        audit(draft, 'room.create', 'room', id, `إضافة غرفة ${room.name}`);
      });
      return { ok: true, data: id };
    },
    [guard, mutate, enqueue, audit],
  );

  const deleteRoom = useCallback(
    (roomId: UUID): Result<void> => {
      mutate((draft) => {
        draft.windows = draft.windows.filter((w) => w.roomId !== roomId);
        draft.rooms = draft.rooms.filter((r) => r.id !== roomId);
        audit(draft, 'room.delete', 'room', roomId, 'حذف غرفة ومحتوياتها');
      });
      return okVoid;
    },
    [mutate, audit],
  );

  const saveWindow = useCallback(
    (input: {
      id?: UUID;
      projectId: UUID;
      roomId: UUID;
      name: string;
      widthCm: number;
      heightCm: number;
      hasLining: boolean;
      track: WindowUnit['track'];
      fullness: number;
      fabricVariantId: UUID | null;
      liningVariantId: UUID | null;
      quantity: number;
      notes: string;
    }): Result<string> => {
      const denied = guard('enter_measurements');
      if (denied) return denied as Result<string>;
      if (!(input.widthCm > 0) || !(input.heightCm > 0))
        return failWith('العرض والارتفاع يجب أن يكونا أكبر من صفر.', 'validation');
      if (input.heightCm > 500)
        return failWith('الارتفاع أكبر من 500 سم - يحتاج تسعيرة خاصة من الأدمن.', 'validation');
      if (input.fullness < 1.5 || input.fullness > 4)
        return failWith('المضاعف يجب أن يكون بين 1.5 و 4.', 'validation');
      // القماش لم يعد اختياريًا: الحجز صار يجري تلقائيًا عند اعتماد العرض،
      // وهو يقرأ اختيار الشباك. شباكٌ بلا قماش يعني بندًا بلا سعر وحجزًا
      // لا يمكن تنفيذه - فيتوقف الخط كله عند أول اعتماد.
      if (!input.fabricVariantId)
        return failWith('اختر القماش - عليه يقوم السعر والحجز التلقائي.', 'validation');
      if (input.hasLining && !input.liningVariantId)
        return failWith('اخترت «مع بطانة» - فحدّد قماش البطانة أو ألغِ الخيار.', 'validation');
      const id = input.id ?? uid('win');
      mutate((draft) => {
        const existing = draft.windows.find((w) => w.id === id);
        const record: WindowUnit = {
          id,
          organizationId: draft.organization.id,
          projectId: input.projectId,
          roomId: input.roomId,
          name: input.name.trim() || 'شباك',
          widthCm: input.widthCm,
          heightCm: input.heightCm,
          hasLining: input.hasLining,
          track: input.track,
          fullness: input.fullness,
          fabricVariantId: input.fabricVariantId,
          liningVariantId: input.hasLining ? input.liningVariantId : null,
          quantity: input.quantity,
          notes: input.notes,
          measuredAt: new Date().toISOString(),
          measuredBy: userId,
        };
        if (existing) {
          draft.windows = draft.windows.map((w) => (w.id === id ? record : w));
        } else {
          draft.windows.push(record);
        }
        const project = draft.projects.find((p) => p.id === input.projectId);
        if (project && (project.status === 'new_request' || project.status === 'awaiting_measurement')) {
          project.status = 'measured';
        }
        enqueue(draft, 'window.save', `قياس: ${record.name}`, id);
        audit(draft, 'window.save', 'window', id, `حفظ قياس ${record.name}`);
      });
      return { ok: true, data: id };
    },
    [guard, mutate, enqueue, audit, userId],
  );

  const deleteWindow = useCallback(
    (windowId: UUID): Result<void> => {
      mutate((draft) => {
        draft.windows = draft.windows.filter((w) => w.id !== windowId);
        audit(draft, 'window.delete', 'window', windowId, 'حذف شباك');
      });
      return okVoid;
    },
    [mutate, audit],
  );

  // ── Attachments (queued upload) ───────────────────────────────────────────
  const addAttachment = useCallback(
    (input: {
      projectId: UUID;
      roomId?: UUID | null;
      windowId?: UUID | null;
      visitId?: UUID | null;
      kind: AttachmentKind;
      uri: string;
      caption?: string;
    }): Result<string> => {
      const id = uid('att');
      mutate((draft) => {
        const att: Attachment = {
          id,
          organizationId: draft.organization.id,
          projectId: input.projectId,
          roomId: input.roomId ?? null,
          windowId: input.windowId ?? null,
          visitId: input.visitId ?? null,
          kind: input.kind,
          uri: input.uri,
          caption: input.caption ?? '',
          createdBy: userId ?? 'system',
          createdAt: new Date().toISOString(),
          uploaded: false,
        };
        draft.attachments.unshift(att);
        enqueue(draft, 'attachment.upload', 'رفع صورة', id);
      });
      return { ok: true, data: id };
    },
    [mutate, enqueue, userId],
  );

  const removeAttachment = useCallback(
    (id: UUID): Result<void> => {
      mutate((draft) => {
        draft.attachments = draft.attachments.filter((a) => a.id !== id);
      });
      return okVoid;
    },
    [mutate],
  );

  // ── Field visits ──────────────────────────────────────────────────────────
  const scheduleVisit = useCallback(
    (projectId: UUID, assigneeId: UUID, type: VisitType, scheduledAt: string): Result<string> => {
      const denied = guard('install');
      if (denied) return denied as Result<string>;
      // زيارة تركيب واحدة مفتوحة لكل مشروع: جدولتها مرتين تُنتج زيارتين
      // متطابقتين وموعدَي تركيب متضاربين على المشروع نفسه
      if (
        db.fieldVisits.some(
          (v) => v.projectId === projectId && v.type === type && v.status !== 'completed',
        )
      )
        return failWith('توجد زيارة من هذا النوع مجدولة بالفعل لهذا المشروع.', 'conflict');
      const id = uid('fv');
      mutate((draft) => {
        draft.fieldVisits.unshift({
          id,
          organizationId: draft.organization.id,
          projectId,
          assigneeId,
          type,
          status: 'scheduled',
          scheduledAt,
          startedAt: null,
          completedAt: null,
          notes: '',
          checklist: { track: false, curtain: false, height: false, cleanliness: false },
          customerSignedOff: false,
        });
        const project = draft.projects.find((p) => p.id === projectId);
        if (project && type === 'installation') project.installationDate = scheduledAt;
        if (project && type === 'measurement') project.measurementDate = scheduledAt;
        notify(
          draft,
          assigneeId,
          'visit_assigned',
          type === 'measurement' ? 'زيارة قياس جديدة' : 'زيارة تركيب جديدة',
          project ? `${project.title} - ${project.code}` : '',
          `/visit/${id}`,
        );
        audit(draft, 'visit.schedule', 'field_visit', id, 'جدولة زيارة ميدانية');
      });
      return { ok: true, data: id };
    },
    [guard, db.fieldVisits, mutate, notify, audit],
  );

  const updateVisit = useCallback(
    (id: UUID, patch: Partial<FieldVisit>): Result<void> => {
      const denied = guard('install');
      if (denied) return denied;
      mutate((draft) => {
        draft.fieldVisits = draft.fieldVisits.map((v) => (v.id === id ? { ...v, ...patch } : v));
        enqueue(draft, 'visit.update', 'تحديث زيارة ميدانية', id);
      });
      return okVoid;
    },
    [guard, mutate, enqueue],
  );

  const startVisit = useCallback(
    (id: UUID): Result<void> => {
      const denied = guard('install');
      if (denied) return denied;
      mutate((draft) => {
        const visit = draft.fieldVisits.find((v) => v.id === id);
        if (!visit) return;
        visit.status = 'in_progress';
        visit.startedAt = new Date().toISOString();
        // زيارة القياس تبدأ فعليًا: المشروع ينتقل من «بانتظار القياس» إلى
        // الجدول الزمني الجاري. (كان الشرط هنا يُسند الحالة إلى نفسها.)
        const project = draft.projects.find((p) => p.id === visit.projectId);
        if (project && visit.type === 'measurement' && project.status === 'new_request') {
          project.status = 'awaiting_measurement';
        }
        enqueue(draft, 'visit.start', 'بدء زيارة ميدانية', id);
        audit(draft, 'visit.start', 'field_visit', id, 'بدء الزيارة الميدانية');
      });
      return okVoid;
    },
    [guard, mutate, enqueue, audit],
  );

  const completeVisit = useCallback(
    (id: UUID): Result<void> => {
      const denied = guard('install');
      if (denied) return denied;
      const visit = db.fieldVisits.find((v) => v.id === id);
      if (!visit) return failWith('الزيارة غير موجودة.', 'validation');
      if (visit.type === 'measurement') {
        const count = db.windows.filter((w) => w.projectId === visit.projectId).length;
        if (count === 0)
          return failWith('لا يمكن إكمال زيارة القياس بدون تسجيل شباك واحد على الأقل.', 'validation');
      } else {
        const c = visit.checklist;
        if (!c.track || !c.curtain || !c.height || !c.cleanliness)
          return failWith('أكمل قائمة التحقق قبل إنهاء التركيب.', 'validation');
        if (!visit.customerSignedOff)
          return failWith('يلزم تأكيد الزبون قبل إنهاء التركيب.', 'validation');
        // الصور اختيارية بقرار المالك: قائمة التحقق وتوقيع الزبون هما
        // الإثبات الملزم، والصورة توثيق إضافي لمن أراده
      }
      mutate((draft) => {
        const v = draft.fieldVisits.find((x) => x.id === id);
        if (!v) return;
        v.status = 'completed';
        v.completedAt = new Date().toISOString();
        const project = draft.projects.find((p) => p.id === v.projectId);
        if (project) {
          if (v.type === 'measurement' && project.status === 'awaiting_measurement') {
            project.status = 'measured';
          }
          if (v.type === 'installation') {
            project.status = 'installed';
          }
          project.updatedAt = new Date().toISOString();
        }
        enqueue(draft, 'visit.complete', 'إكمال زيارة ميدانية', id);
        audit(draft, 'visit.complete', 'field_visit', id, 'إكمال الزيارة ومزامنة البيانات');
      });
      return okVoid;
    },
    [guard, db.fieldVisits, db.windows, db.attachments, mutate, enqueue, audit],
  );

  // ── Quotations ────────────────────────────────────────────────────────────
  const buildItems = useCallback(
    (projectId: UUID): QuotationItem[] => {
      return db.windows
        .filter((w) => w.projectId === projectId)
        .map((w) => {
          const variant = db.fabricVariants.find((v) => v.id === w.fabricVariantId) ?? null;
          const product = db.fabricProducts.find((p) => p.id === variant?.productId) ?? null;
          const lining = db.fabricVariants.find((v) => v.id === w.liningVariantId) ?? null;
          const room = db.rooms.find((r) => r.id === w.roomId);
          const p = priceWindow({
            window: w,
            product,
            variant,
            liningVariant: lining,
            rules: db.pricingRules,
            settings: db.settings,
          });
          return {
            id: uid('qi'),
            windowId: w.id,
            roomName: room?.name ?? '',
            windowName: w.name,
            description: `${product?.name ?? ''} ${variant?.colorName ?? ''}${w.hasLining ? ' مع بطانة' : ' بدون بطانة'}`.trim(),
            widthCm: w.widthCm,
            heightCm: w.heightCm,
            runningMeters: p.runningMeters,
            quantity: w.quantity,
            category: p.category,
            band: p.band,
            unitPriceAgorot: p.unitPriceAgorot,
            lineTotalAgorot: p.lineTotalAgorot,
            internalCostAgorot: p.internalCostAgorot,
            fabricMeters: p.fabricMeters,
            liningMeters: p.liningMeters,
          } satisfies QuotationItem;
        });
    },
    [db.windows, db.fabricVariants, db.fabricProducts, db.rooms, db.pricingRules, db.settings],
  );

  const createQuotation = useCallback(
    (projectId: UUID): Result<string> => {
      const denied = guard('create_quotation');
      if (denied) return denied as Result<string>;
      const items = buildItems(projectId);
      if (items.length === 0)
        return failWith('لا توجد شبابيك مقاسة - لا يمكن إنشاء عرض سعر.', 'validation');
      const existing = db.quotations.find((q) => q.projectId === projectId);
      if (existing) return { ok: true, data: existing.id };
      const qid = uid('qt');
      const vid = uid('qv');
      mutate((draft) => {
        const project = draft.projects.find((p) => p.id === projectId);
        const totals = computeTotals(items, 0, draft.settings);
        const now = new Date();
        const version: QuotationVersion = {
          id: vid,
          organizationId: draft.organization.id,
          quotationId: qid,
          versionNumber: 1,
          status: 'draft',
          items,
          subtotalAgorot: totals.subtotalAgorot,
          discountPercent: 0,
          discountAgorot: 0,
          vatAgorot: totals.vatAgorot,
          totalAgorot: totals.totalAgorot,
          internalCostAgorot: totals.internalCostAgorot,
          marginPercent: totals.marginPercent,
          validUntil: new Date(
            now.getTime() + draft.settings.quotationValidityDays * 86400000,
          ).toISOString(),
          note: '',
          createdBy: userId ?? 'system',
          createdAt: now.toISOString(),
          sentAt: null,
          approvedAt: null,
          locked: false,
        };
        draft.quotationVersions.push(version);
        draft.quotations.unshift({
          id: qid,
          organizationId: draft.organization.id,
          projectId,
          number: `QT-2026-${(project?.code ?? '').replace('BD-', '') || draft.quotations.length + 1}`,
          status: 'draft',
          currentVersionId: vid,
          createdAt: now.toISOString(),
        });
        if (project && project.status === 'measured') project.status = 'quotation';
        audit(draft, 'quotation.create', 'quotation', qid, 'إنشاء عرض سعر من القياسات');
      });
      return { ok: true, data: qid };
    },
    [guard, buildItems, db.quotations, mutate, audit, userId],
  );

  /** Sent versions are immutable — any change forks a brand new version. */
  const createVersion = useCallback(
    (quotationId: UUID, discountPercent: number, note: string): Result<string> => {
      const denied = guard('create_quotation');
      if (denied) return denied as Result<string>;
      const quotation = db.quotations.find((q) => q.id === quotationId);
      if (!quotation) return failWith('العرض غير موجود.', 'validation');
      if (discountPercent < 0 || discountPercent > 100)
        return failWith('نسبة الخصم غير صالحة.', 'validation');
      const items = buildItems(quotation.projectId);
      const vid = uid('qv');
      mutate((draft) => {
        const versions = draft.quotationVersions.filter((v) => v.quotationId === quotationId);
        const totals = computeTotals(items, discountPercent, draft.settings);
        const now = new Date();
        draft.quotationVersions.push({
          id: vid,
          organizationId: draft.organization.id,
          quotationId,
          versionNumber: versions.length + 1,
          status: 'draft',
          items,
          subtotalAgorot: totals.subtotalAgorot,
          discountPercent,
          discountAgorot: totals.discountAgorot,
          vatAgorot: totals.vatAgorot,
          totalAgorot: totals.totalAgorot,
          internalCostAgorot: totals.internalCostAgorot,
          marginPercent: totals.marginPercent,
          validUntil: new Date(
            now.getTime() + draft.settings.quotationValidityDays * 86400000,
          ).toISOString(),
          note,
          createdBy: userId ?? 'system',
          createdAt: now.toISOString(),
          sentAt: null,
          approvedAt: null,
          locked: false,
        });
        const q = draft.quotations.find((x) => x.id === quotationId);
        if (q) {
          q.currentVersionId = vid;
          q.status = 'draft';
        }
        audit(
          draft,
          'quotation.version',
          'quotation_version',
          vid,
          `إنشاء نسخة ${versions.length + 1} بخصم ${discountPercent}%`,
        );
      });
      return { ok: true, data: vid };
    },
    [guard, db.quotations, buildItems, mutate, audit, userId],
  );

  const sendVersion = useCallback(
    async (versionId: UUID): Promise<Result<void>> => {
      const denied = guard('create_quotation');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      setBusy('send-quote');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const v = draft.quotationVersions.find((x) => x.id === versionId);
        if (!v) return;
        v.status = 'sent';
        v.sentAt = new Date().toISOString();
        v.locked = true;
        const q = draft.quotations.find((x) => x.id === v.quotationId);
        if (q) q.status = 'sent';
        audit(draft, 'quotation.send', 'quotation_version', versionId, 'إرسال العرض للزبون');
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, audit],
  );

  const decideVersion = useCallback(
    async (versionId: UUID, decision: 'approved' | 'rejected'): Promise<Result<void>> => {
      const denied = guard('create_quotation');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      setBusy('decide-quote');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const v = draft.quotationVersions.find((x) => x.id === versionId);
        if (!v) return;
        v.status = decision;
        v.locked = true;
        if (decision === 'approved') v.approvedAt = new Date().toISOString();
        const q = draft.quotations.find((x) => x.id === v.quotationId);
        if (q) {
          q.status = decision;
          const project = draft.projects.find((p) => p.id === q.projectId);
          if (project && decision === 'approved' && project.status === 'quotation') {
            project.status = 'customer_approved';
          }
          // M25: موافقة الزبون تعني ورشة قادمة - الخياط يعلم لحظتها لا حين
          // يصادف الأمر في قائمته
          if (project && decision === 'approved' && project.tailorId) {
            notify(
              draft,
              project.tailorId,
              'tailor_assignment',
              'ورشة جديدة',
              `${project.title} - وافق الزبون وسيصلك أمر الإنتاج.`,
              `/project/${project.id}`,
            );
          }
        }
        audit(
          draft,
          `quotation.${decision}`,
          'quotation_version',
          versionId,
          decision === 'approved' ? 'اعتماد العرض من الزبون' : 'رفض العرض',
        );
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, audit],
  );

  const requestDiscount = useCallback(
    (quotationId: UUID, versionId: UUID, percent: number, reason: string): Result<void> => {
      if (!reason.trim()) return failWith('سبب الخصم مطلوب.', 'validation');
      mutate((draft) => {
        const id = uid('dr');
        draft.discountRequests.unshift({
          id,
          organizationId: draft.organization.id,
          quotationId,
          versionId,
          requestedPercent: percent,
          reason: reason.trim(),
          status: 'pending',
          requestedBy: userId ?? 'system',
          decidedBy: null,
          decidedAt: null,
          createdAt: new Date().toISOString(),
        });
        draft.profiles
          .filter((p) => p.role === 'admin')
          .forEach((admin) =>
            notify(
              draft,
              admin.id,
              'discount_request',
              `طلب خصم ${percent}%`,
              reason.trim(),
              '/discounts',
            ),
          );
        audit(draft, 'discount.request', 'discount_request', id, `طلب خصم ${percent}%`);
      });
      return okVoid;
    },
    [mutate, notify, audit, userId],
  );

  const decideDiscount = useCallback(
    async (requestId: UUID, decision: 'approved' | 'rejected'): Promise<Result<void>> => {
      const denied = guard('approve_discount');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      setBusy('decide-discount');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const req = draft.discountRequests.find((r) => r.id === requestId);
        if (!req) return;
        req.status = decision;
        req.decidedBy = userId;
        req.decidedAt = new Date().toISOString();
        if (decision === 'approved') {
          const quotation = draft.quotations.find((q) => q.id === req.quotationId);
          const base = draft.quotationVersions.find((v) => v.id === req.versionId);
          if (quotation && base) {
            const totals = computeTotals(base.items, req.requestedPercent, draft.settings);
            const vid = uid('qv');
            const versions = draft.quotationVersions.filter((v) => v.quotationId === quotation.id);
            draft.quotationVersions.push({
              ...base,
              id: vid,
              versionNumber: versions.length + 1,
              status: 'draft',
              discountPercent: req.requestedPercent,
              discountAgorot: totals.discountAgorot,
              vatAgorot: totals.vatAgorot,
              totalAgorot: totals.totalAgorot,
              marginPercent: totals.marginPercent,
              note: `نسخة معتمدة بخصم استثنائي ${req.requestedPercent}% - ${req.reason}`,
              createdAt: new Date().toISOString(),
              sentAt: null,
              approvedAt: null,
              locked: false,
            });
            quotation.currentVersionId = vid;
            quotation.status = 'draft';
          }
        }
        notify(
          draft,
          req.requestedBy,
          'discount_request',
          decision === 'approved' ? 'تمت الموافقة على الخصم' : 'تم رفض الخصم',
          `طلب خصم ${req.requestedPercent}%`,
          '/discounts',
        );
        audit(
          draft,
          `discount.${decision}`,
          'discount_request',
          requestId,
          `${decision === 'approved' ? 'اعتماد' : 'رفض'} خصم ${req.requestedPercent}%`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, notify, audit, userId],
  );

  // ── Inventory (server-authoritative) ──────────────────────────────────────
  const addMovement = useCallback(
    (
      draft: Database,
      rollId: UUID,
      type: MovementType,
      quantityM: number,
      projectId: UUID | null,
      reservationId: UUID | null,
      reason: string,
    ) => {
      draft.stockMovements.unshift({
        id: uid('mv'),
        organizationId: draft.organization.id,
        rollId,
        type,
        quantityM: round3(quantityM),
        projectId,
        reservationId,
        notes: reason,
        createdBy: userId ?? 'system',
        createdAt: new Date().toISOString(),
        idempotencyKey: uid('idem'),
      });
    },
    [userId],
  );

  const reserveFabric = useCallback(
    async (projectId: UUID, rollId: UUID, quantityM: number): Promise<Result<void>> => {
      const denied = guard('reserve_fabric');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      const balance = rollBalance(rollId, db.stockMovements);
      const check = canReserve(round3(quantityM), balance);
      if (!check.ok) return failWith(check.error ?? 'تعذر الحجز.', 'validation');
      setBusy('reserve');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        // Re-check inside the "transaction" — mirrors SELECT ... FOR UPDATE.
        const fresh = rollBalance(rollId, draft.stockMovements);
        if (quantityM > fresh.availableM) return;
        const resId = uid('res');
        draft.reservations.unshift({
          id: resId,
          organizationId: draft.organization.id,
          projectId,
          rollId,
          quantityM: round3(quantityM),
          consumedM: 0,
          status: 'active',
          createdBy: userId ?? 'system',
          createdAt: new Date().toISOString(),
        });
        addMovement(draft, rollId, 'reservation', quantityM, projectId, resId, 'حجز لمشروع');
        const project = draft.projects.find((p) => p.id === projectId);
        const roll = draft.fabricRolls.find((r) => r.id === rollId);
        if (project && project.status === 'customer_approved') project.status = 'fabric_allocated';
        audit(
          draft,
          'inventory.reserve',
          'fabric_reservation',
          resId,
          `حجز ${round3(quantityM)} م من ${roll?.code ?? ''} لمشروع ${project?.code ?? ''}`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, db.stockMovements, mutate, addMovement, audit, userId],
  );

  /**
   * الحجز التلقائي بعد اعتماد العرض.
   *
   * الطاقم لا يختار رولًا ولا يكتب كمية: الاختيار مسجَّل أصلًا على كل شباك،
   * والكمية محسوبة من القياس والمضاعف. كل ضغطة بعد ذلك تكرارٌ لما تعرفه
   * القاعدة سلفًا.
   *
   * والقاعدة الحاكمة: صنفٌ لا يكفي مخزونه يُترك كله بلا حجز. الحجز الجزئي
   * يقضم المتاح ويوهم بالتقدّم بينما الإنتاج ما زال متوقفًا، ويجعل حجم النقص
   * أصعب قراءةً مما لو بقي الصنف كما هو.
   */
  const autoReserveForProject = useCallback(
    async (projectId: UUID): Promise<Result<{ reserved: number; short: FabricGap[] }>> => {
      const denied = guard('reserve_fabric');
      if (denied) return denied as Result<{ reserved: number; short: FabricGap[] }>;
      const offline = requireOnline();
      if (offline) return offline as Result<{ reserved: number; short: FabricGap[] }>;

      setBusy('reserve');
      await serverLatency();
      setBusy(null);

      // القرار كله داخل المعاملة على النسخة الطازجة. حسابُه قبل الانتظار كان
      // يسمح بكتابة «القماش مخصَّص» على مشروعٍ لم يُحجز له شيء إذا تغيّر
      // المخزون أثناء انتظار الخادم - حالة كاذبة لا مجرد سباق نظري.
      let reserved = 0;
      let short: FabricGap[] = [];
      mutate((draft) => {
        const gaps = projectFabricGaps(draft, projectId).filter((g) => g.remaining > 0);
        short = gaps.filter((g) => g.available < g.remaining);

        for (const gap of gaps.filter((g) => g.available >= g.remaining)) {
          const picks = pickRolls(draft, gap.variantId, gap.remaining);
          // الصنف كله أو لا شيء: شريحة واحدة لا تصمد على الرصيد تُسقط الصنف
          // بكامله إلى قائمة النقص. القفز فوقها وحدها كان يُنتج حجزًا جزئيًا -
          // نقيض القاعدة المعلنة، يقضم المتاح دون أن يُطلق الإنتاج.
          const fits =
            picks.length > 0 &&
            picks.every((p) => p.meters <= rollBalance(p.rollId, draft.stockMovements).availableM);
          if (!fits) {
            short.push(gap);
            continue;
          }
          for (const pick of picks) {
            const resId = uid('res');
            draft.reservations.unshift({
              id: resId,
              organizationId: draft.organization.id,
              projectId,
              rollId: pick.rollId,
              quantityM: round3(pick.meters),
              consumedM: 0,
              status: 'active',
              createdBy: userId ?? 'system',
              createdAt: new Date().toISOString(),
            });
            addMovement(draft, pick.rollId, 'reservation', pick.meters, projectId, resId, 'حجز تلقائي بعد اعتماد العرض');
            reserved += 1;
            const roll = draft.fabricRolls.find((r) => r.id === pick.rollId);
            audit(
              draft,
              'inventory.reserve',
              'fabric_reservation',
              resId,
              `حجز تلقائي ${round3(pick.meters)} م من ${roll?.code ?? ''}`,
            );
          }
        }
        const project = draft.projects.find((p) => p.id === projectId);
        // المرحلة تتقدّم فقط حين لا ينقص شيء - والحكم من النسخة نفسها التي جرى
        // عليها الحجز، لا من لقطة سبقت الانتظار
        if (project && project.status === 'customer_approved' && short.length === 0) {
          project.status = 'fabric_allocated';
        }
      });
      return { ok: true, data: { reserved, short } };
    },
    [guard, requireOnline, mutate, addMovement, audit, userId],
  );

  const releaseReservation = useCallback(
    async (reservationId: UUID, reason: string): Promise<Result<void>> => {
      const denied = guard('reserve_fabric');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      setBusy('release');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const res = draft.reservations.find((r) => r.id === reservationId);
        if (!res || res.status === 'released') return;
        const remaining = round3(res.quantityM - res.consumedM);
        if (remaining > 0) {
          addMovement(
            draft,
            res.rollId,
            'reservation_release',
            remaining,
            res.projectId,
            res.id,
            reason || 'فك الحجز',
          );
        }
        res.status = 'released';
        audit(draft, 'inventory.release', 'fabric_reservation', res.id, `فك حجز ${remaining} م`);
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, addMovement, audit],
  );

  const consumeFabric = useCallback(
    async (reservationId: UUID, quantityM: number, reason: string): Promise<Result<void>> => {
      const denied = guard('update_production');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      const res = db.reservations.find((r) => r.id === reservationId);
      if (!res) return failWith('الحجز غير موجود.', 'validation');
      const planned = round3(res.quantityM - res.consumedM);
      const over = quantityM > planned + 0.0001;
      if (over && !reason.trim())
        return failWith('الاستهلاك أعلى من المخطط - السبب إلزامي.', 'validation');
      if (!over) {
        const check = canConsume(round3(quantityM), res);
        if (!check.ok) return failWith(check.error ?? 'تعذر تسجيل الاستهلاك.', 'validation');
      }
      const balance = rollBalance(res.rollId, db.stockMovements);
      if (quantityM > balance.onHandM)
        return failWith('الكمية أكبر من الرصيد الفعلي للرول.', 'validation');
      setBusy('consume');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const r = draft.reservations.find((x) => x.id === reservationId);
        if (!r) return;
        addMovement(
          draft,
          r.rollId,
          'consumption',
          quantityM,
          r.projectId,
          r.id,
          reason || 'استهلاك إنتاج',
        );
        r.consumedM = round3(r.consumedM + quantityM);
        r.status = r.consumedM >= r.quantityM ? 'consumed' : 'partially_consumed';
        draft.usages.unshift({
          id: uid('use'),
          organizationId: draft.organization.id,
          projectId: r.projectId,
          // استهلاك عام غير منسوب لشباك - المسار القديم الباقي للتصحيحات
          windowId: null,
          reservationId: r.id,
          rollId: r.rollId,
          plannedM: planned,
          actualM: round3(quantityM),
          wasteM: round3(Math.max(0, quantityM - planned)),
          notes: reason.trim(),
          createdBy: userId ?? 'system',
          createdAt: new Date().toISOString(),
        });
        if (over) {
          draft.profiles
            .filter((p) => p.role === 'admin')
            .forEach((admin) =>
              notify(
                draft,
                admin.id,
                'low_stock',
                'استهلاك أعلى من المخطط',
                `${round3(quantityM)} م بدل ${planned} م - ${reason}`,
                `/project/${r.projectId}`,
              ),
            );
        }
        audit(
          draft,
          'inventory.consume',
          'fabric_usage',
          r.id,
          `تسجيل استهلاك ${round3(quantityM)} م`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, db.reservations, db.stockMovements, mutate, addMovement, notify, audit, userId],
  );

  /**
   * إنهاء شباك: تأكيدُ إنجازه هو نفسه تسجيلُ ما استُهلك له.
   *
   * الخياط لا يعلّم خانة ثم يسجّل استهلاكًا في مكان آخر - الأمران واقعة
   * واحدة. ولهذا لا يوجد حقل «منجز» على الشباك: وجود سجلّ استهلاك له هو
   * الإنجاز، فلا تنفصل العلامة عن الرقم ولا يمكن أن يوجد أحدهما بلا الآخر.
   *
   * الزيادة عن المخصَّص واقعة يومية لا خطأ: قصّة خاطئة أو تكرار نقشة يأكل
   * أمتارًا. فهي مسموحة بسبب مكتوب وإشعار للأدمن، وتُقيَّد على الحجز الأخير
   * لأن الأمتار الزائدة تخرج فعليًا من الرول نفسه. ما لا يُسمح به هو تجاوز
   * الرصيد الفعلي للرول - ذاك ليس زيادةً بل رصيد سالب.
   */
  const completeWindow = useCallback(
    async (windowId: UUID, actualM: number, reason: string): Promise<Result<void>> => {
      const denied = guard('update_production');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;

      const win = db.windows.find((w) => w.id === windowId);
      if (!win) return failWith('الشباك غير موجود.', 'validation');
      if (db.usages.some((u) => u.windowId === windowId))
        return failWith('هذا الشباك مسجَّل منجزًا بالفعل.', 'conflict');
      if (!(actualM > 0)) return failWith('الكمية المستهلكة مطلوبة.', 'validation');

      const planned = windowFabricNeed(db, windowId);
      const over = actualM > planned + 0.0001;
      if (over && !reason.trim())
        return failWith(`الاستهلاك أعلى من المخطط (${planned} م) - اكتب السبب.`, 'validation');

      // حجوزات المشروع من صنف هذا الشباك، بالأقدم فالأقدم
      const mine = db.reservations
        .filter((r) => {
          if (r.projectId !== win.projectId || r.status === 'released') return false;
          return db.fabricRolls.find((x) => x.id === r.rollId)?.variantId === win.fabricVariantId;
        })
        .slice()
        .reverse();
      if (mine.length === 0)
        return failWith('لا يوجد قماش محجوز لهذا الشباك - راجع تبويب القماش.', 'validation');

      // توزيع الكمية على الحجوزات، والبقية على الأخير
      const slices: { reservationId: UUID; meters: number }[] = [];
      let left = round3(actualM);
      for (const r of mine) {
        if (left <= 0) break;
        const free = round3(Math.max(0, r.quantityM - r.consumedM));
        if (free <= 0) continue;
        const take = round3(Math.min(free, left));
        slices.push({ reservationId: r.id, meters: take });
        left = round3(left - take);
      }
      if (left > 0) {
        const last = slices[slices.length - 1];
        if (last) last.meters = round3(last.meters + left);
        else slices.push({ reservationId: mine[mine.length - 1].id, meters: left });
      }

      // الرصيد الفعلي يُفحص قبل أي كتابة: لا يصير رول سالبًا
      for (const s of slices) {
        const res = db.reservations.find((r) => r.id === s.reservationId)!;
        if (s.meters > rollBalance(res.rollId, db.stockMovements).onHandM)
          return failWith('الكمية أكبر من الرصيد الفعلي للرول.', 'validation');
      }

      setBusy('consume');
      await serverLatency();
      setBusy(null);

      mutate((draft) => {
        let plannedLeft = planned;
        for (const s of slices) {
          const r = draft.reservations.find((x) => x.id === s.reservationId);
          if (!r) continue;
          addMovement(
            draft,
            r.rollId,
            'consumption',
            s.meters,
            r.projectId,
            r.id,
            reason.trim() || `إنهاء ${win.name}`,
          );
          r.consumedM = round3(r.consumedM + s.meters);
          r.status = r.consumedM >= r.quantityM ? 'consumed' : 'partially_consumed';
          // المخطط يُوزَّع على الشرائح بالترتيب فيبقى مجموعه = مخطط الشباك،
          // ويخرج الهدر صحيحًا على كل شريحة
          const sharePlanned = round3(Math.min(plannedLeft, s.meters));
          plannedLeft = round3(plannedLeft - sharePlanned);
          draft.usages.unshift({
            id: uid('use'),
            organizationId: draft.organization.id,
            projectId: r.projectId,
            windowId,
            reservationId: r.id,
            rollId: r.rollId,
            plannedM: sharePlanned,
            actualM: s.meters,
            wasteM: round3(Math.max(0, s.meters - sharePlanned)),
            notes: reason.trim(),
            createdBy: userId ?? 'system',
            createdAt: new Date().toISOString(),
          });
        }
        if (over) {
          draft.profiles
            .filter((p) => p.role === 'admin')
            .forEach((admin) =>
              notify(
                draft,
                admin.id,
                'low_stock',
                'استهلاك أعلى من المخطط',
                `${win.name}: ${round3(actualM)} م بدل ${planned} م - ${reason.trim()}`,
                `/project/${win.projectId}`,
              ),
            );
        }
        audit(
          draft,
          'production.window_done',
          'window',
          windowId,
          `إنهاء ${win.name} باستهلاك ${round3(actualM)} م من ${planned} م مخططة`,
        );
      });
      return okVoid;
    },
    [
      guard,
      requireOnline,
      db,
      mutate,
      addMovement,
      notify,
      audit,
      userId,
    ],
  );

  const adjustStock = useCallback(
    async (
      rollId: UUID,
      type: Extract<MovementType, 'return' | 'damage' | 'adjustment_in' | 'adjustment_out' | 'receipt'>,
      quantityM: number,
      reason: string,
    ): Promise<Result<void>> => {
      const denied = guard('reserve_fabric');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      if (!(quantityM > 0)) return failWith('الكمية يجب أن تكون أكبر من صفر.', 'validation');
      // السبب إلزامي لما يُنقص الرصيد أو يوثّق تلفًا (أثر تدقيقي لا غنى عنه)،
      // واختياري لما يزيده: الاستلام والإرجاع روتين يومي، وإلزام تبريره
      // يُنتج أسبابًا صورية تُفسد التقارير بدل أن تُثريها
      const needsReason = type === 'damage' || type === 'adjustment_out';
      if (needsReason && !reason.trim()) {
        return failWith('حركات التلف والتسوية بالنقصان تحتاج سببًا مسجَّلًا.', 'validation');
      }
      const balance = rollBalance(rollId, db.stockMovements);
      if ((type === 'damage' || type === 'adjustment_out') && quantityM > balance.onHandM)
        return failWith('لا يمكن أن يصبح الرصيد سالبًا.', 'validation');
      setBusy('adjust');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        addMovement(draft, rollId, type, quantityM, null, null, reason.trim());
        const roll = draft.fabricRolls.find((r) => r.id === rollId);
        audit(
          draft,
          'inventory.movement',
          'stock_movement',
          rollId,
          `${type} ${round3(quantityM)} م على ${roll?.code ?? ''}`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, db.stockMovements, mutate, addMovement, audit],
  );

  /* ── مكتبة الأقمشة ─────────────────────────────────────────────────
     ثلاث طبقات لا واحدة: القماش (نوع ومورّد وعرض)، ثم اللون (تكلفة ورمز
     مخزني)، ثم الرول (شحنة فعلية بدفعة صبغ ورقم). الخلط بينها هو ما يجعل
     دفعتَي صبغ تلتقيان في ستارة واحدة. */

  const saveFabricProduct = useCallback(
    (input: {
      id?: UUID;
      name: string;
      kind: FabricKind;
      supplier: string;
      widthCm: number;
      composition: string;
    }): Result<string> => {
      const denied = guard('manage_fabrics');
      if (denied) return denied as Result<string>;
      if (!input.name.trim()) return failWith('اسم القماش مطلوب.', 'validation');
      if (!(input.widthCm > 0)) return failWith('عرض القماش يجب أن يكون أكبر من صفر.', 'validation');
      const id = input.id ?? uid('prd');
      mutate((draft) => {
        const existing = draft.fabricProducts.find((p) => p.id === id);
        const record: FabricProduct = {
          id,
          organizationId: draft.organization.id,
          name: input.name.trim(),
          kind: input.kind,
          supplier: input.supplier.trim(),
          widthCm: input.widthCm,
          composition: input.composition.trim(),
          imageUrl: existing?.imageUrl ?? '',
        };
        if (existing) Object.assign(existing, record);
        else draft.fabricProducts.push(record);
        enqueue(draft, 'fabric.product.save', `${existing ? 'تعديل' : 'إضافة'} قماش: ${record.name}`, id);
        audit(
          draft,
          existing ? 'fabric.product.update' : 'fabric.product.create',
          'fabric_product',
          id,
          `${existing ? 'تعديل' : 'إضافة'} قماش ${record.name}`,
        );
      });
      return { ok: true, data: id };
    },
    [guard, mutate, enqueue, audit],
  );

  const saveFabricVariant = useCallback(
    (input: {
      id?: UUID;
      productId: UUID;
      colorName: string;
      colorHex: string;
      sku: string;
      costPerMeterAgorot: number;
      /** زيادة على سعر المتر للزبون - للبطانة 100% مثلًا. صفر لغيرها. */
      customerSurchargePerMeterAgorot?: number;
      /** أمتار الصنف لكل متر طولي؛ صفر = اتبع مضاعف الشباك. */
      metersPerRunningMeter?: number;
    }): Result<string> => {
      const denied = guard('manage_fabrics');
      if (denied) return denied as Result<string>;
      if (!input.colorName.trim()) return failWith('اسم اللون مطلوب.', 'validation');
      if (!/^#[0-9a-fA-F]{6}$/.test(input.colorHex))
        return failWith('رمز اللون يجب أن يكون بصيغة ‎#RRGGBB.', 'validation');
      if (!(input.costPerMeterAgorot > 0))
        return failWith('تكلفة المتر مطلوبة - عليها يقوم حساب الربح.', 'validation');
      const sku = input.sku.trim().toUpperCase();
      if (
        sku &&
        db.fabricVariants.some((v) => v.id !== input.id && v.sku.toUpperCase() === sku)
      )
        return failWith('الرمز المخزني مستعمل للون آخر.', 'conflict');
      const id = input.id ?? uid('var');
      mutate((draft) => {
        const existing = draft.fabricVariants.find((v) => v.id === id);
        const record: FabricVariant = {
          id,
          organizationId: draft.organization.id,
          productId: input.productId,
          colorName: input.colorName.trim(),
          colorHex: input.colorHex,
          sku,
          costPerMeterAgorot: Math.round(input.costPerMeterAgorot),
          customerSurchargePerMeterAgorot: Math.round(input.customerSurchargePerMeterAgorot ?? 0),
          metersPerRunningMeter: input.metersPerRunningMeter ?? 0,
          imageUrl: existing?.imageUrl ?? '',
        };
        if (existing) Object.assign(existing, record);
        else draft.fabricVariants.push(record);
        const product = draft.fabricProducts.find((p) => p.id === input.productId);
        enqueue(draft, 'fabric.variant.save', `${existing ? 'تعديل' : 'إضافة'} لون: ${record.colorName}`, id);
        audit(
          draft,
          existing ? 'fabric.variant.update' : 'fabric.variant.create',
          'fabric_variant',
          id,
          `${existing ? 'تعديل' : 'إضافة'} لون ${record.colorName} على ${product?.name ?? ''}`,
        );
      });
      return { ok: true, data: id };
    },
    [guard, db.fabricVariants, mutate, enqueue, audit],
  );

  /**
   * استلام بضاعة = رول جديد، لا زيادة على رول قائم.
   *
   * إضافة الأمتار إلى رولٍ موجود تدمج دفعتَي صبغ تحت رقم واحد، فيختفي
   * التحذير الذي بُني عليه كل منطق الدفعات في التطبيق.
   *
   * M23: الإدخال نوعٌ وأمتار فقط. الرقم والدفعة يولَّدان تلقائيًا -
   * التبسيط في الإدخال لا في النموذج: كل استلام دفعةُ صبغ مستقلة (شحنتان
   * في يوم واحد = دفعتان)، فتحذير اختلاف الدفعات يبقى حيًّا بلا أن يكتب
   * المستخدم حرفًا. ومن عنده رقم المورّد الفعلي يمرّره فيُحترم.
   */
  const addFabricRoll = useCallback(
    (input: {
      variantId: UUID;
      meters: number;
      location?: string;
      code?: string;
      dyeLot?: string;
      /** بضاعة أمانة (M24): تُسنَد لخياط لحظة الاستلام فتظهر في معمله. */
      assignedTailorId?: UUID | null;
    }): Result<string> => {
      const denied = guard('manage_fabrics');
      if (denied) return denied as Result<string>;
      const variant = db.fabricVariants.find((v) => v.id === input.variantId);
      if (!variant) return failWith('اللون غير موجود.', 'validation');
      if (!(input.meters > 0)) return failWith('الأمتار يجب أن تكون أكبر من صفر.', 'validation');
      if (input.assignedTailorId) {
        const t = db.profiles.find((p) => p.id === input.assignedTailorId);
        if (!t || t.role !== 'tailor' || !t.isActive)
          return failWith('اختر خياطًا مفعَّلًا.', 'validation');
      }

      let code = (input.code ?? '').trim().toUpperCase();
      if (code && db.fabricRolls.some((r) => r.code.toUpperCase() === code))
        return failWith('رقم الرول مستعمل - لكل رول رقم واحد.', 'conflict');
      if (!code) {
        // تسلسل على رمز اللون: CR-BEIGE-3 يُقرأ في المخزن بلا فكّ شيفرة
        const base = variant.sku || 'RL';
        let n = db.fabricRolls.filter((r) => r.variantId === variant.id).length + 1;
        code = `${base}-${n}`;
        while (db.fabricRolls.some((r) => r.code.toUpperCase() === code)) {
          n += 1;
          code = `${base}-${n}`;
        }
      }

      let dyeLot = (input.dyeLot ?? '').trim().toUpperCase();
      if (!dyeLot) {
        // دفعة فريدة لكل استلام: تاريخ اليوم + تمييز عند تعدد استلامات اليوم
        const d = new Date();
        const ymd = `${d.getFullYear() % 100}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        let n = 1;
        dyeLot = `LOT-${ymd}`;
        while (db.fabricRolls.some((r) => r.dyeLot === dyeLot)) {
          n += 1;
          dyeLot = `LOT-${ymd}-${n}`;
        }
      }

      const id = uid('roll');
      mutate((draft) => {
        draft.fabricRolls.push({
          id,
          organizationId: draft.organization.id,
          variantId: input.variantId,
          code,
          dyeLot,
          location: (input.location ?? '').trim(),
          initialMeters: round3(input.meters),
          isMiniRoll: false,
          assignedTailorId: input.assignedTailorId ?? null,
          createdAt: new Date().toISOString(),
        });
        addMovement(draft, id, 'receipt', input.meters, null, null, 'استلام بضاعة');
        audit(draft, 'inventory.roll.create', 'fabric_roll', id, `استلام رول ${code} بـ${round3(input.meters)} م`);
      });
      return { ok: true, data: id };
    },
    [guard, db.fabricRolls, db.fabricVariants, mutate, addMovement, audit],
  );

  const createMiniRoll = useCallback(
    async (sourceRollId: UUID, quantityM: number): Promise<Result<void>> => {
      const denied = guard('reserve_fabric');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      if (!(quantityM > 0)) return failWith('الكمية يجب أن تكون أكبر من صفر.', 'validation');
      setBusy('mini-roll');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const source = draft.fabricRolls.find((r) => r.id === sourceRollId);
        if (!source) return;
        const id = uid('roll');
        const count = draft.fabricRolls.filter((r) => r.isMiniRoll).length + 1;
        draft.fabricRolls.push({
          id,
          organizationId: draft.organization.id,
          variantId: source.variantId,
          code: `${source.code.split('-')[0]}-M${String(count).padStart(2, '0')}`,
          dyeLot: source.dyeLot,
          location: source.location,
          initialMeters: round3(quantityM),
          isMiniRoll: true,
          // البقايا تبقى حيث القصّ: عند الخياط نفسه إن كان الأصل مسنَدًا له
          assignedTailorId: source.assignedTailorId,
          createdAt: new Date().toISOString(),
        });
        addMovement(draft, id, 'receipt', quantityM, null, null, `بقايا من ${source.code}`);
        audit(draft, 'inventory.mini_roll', 'fabric_roll', id, `إنشاء Mini Roll من ${source.code}`);
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, addMovement, audit],
  );

  // ── Tailor ────────────────────────────────────────────────────────────────
  const advanceStage = useCallback(
    (assignmentId: UUID, stage: TailorStage): Result<void> => {
      const denied = guard('update_production');
      if (denied) return denied;
      const current = db.tailorAssignments.find((x) => x.id === assignmentId);
      if (!current) return failWith('أمر الإنتاج غير موجود.', 'validation');
      // خطوة واحدة في الاتجاهين لا قفزًا: القفز يترك مراحل بلا توقيت في
      // السجل، فيصير «متوسط مدة الأمر» و«التزام بالموعد» محسوبين على تاريخ
      // ناقص. والرجوع خطوة مسموح لأن الضغطة الخاطئة تقع.
      const from = TAILOR_STAGE_ORDER.indexOf(current.stage);
      const to = TAILOR_STAGE_ORDER.indexOf(stage);
      if (to < 0) return failWith('مرحلة غير معروفة.', 'validation');
      if (Math.abs(to - from) !== 1)
        return failWith('المراحل تتقدّم خطوة واحدة في كل مرة.', 'validation');
      // «جاهز» يُغلق الأمر ويُطلق التركيب، فلا يصحّ قبل أن يُنهى كل شباك.
      // ولمّا كان تأكيد الإنهاء هو نفسه تسجيل الاستهلاك، فهذا الشرط يضمن
      // أيضًا ألّا يُقفل أمرٌ وقماشه ما زال محجوزًا بلا حركة خروج.
      if (stage === 'ready') {
        const wins = db.windows.filter((w) => w.projectId === current.projectId);
        const done = finishedWindowIds(db, current.projectId);
        const left = wins.filter((w) => !done.has(w.id)).length;
        if (left > 0)
          return failWith(`بقي ${left} شباك بلا تأكيد إنهاء - أكّدها قبل الإقفال.`, 'validation');
      }
      mutate((draft) => {
        const a = draft.tailorAssignments.find((x) => x.id === assignmentId);
        if (!a) return;
        a.stage = stage;
        if (!a.startedAt) a.startedAt = new Date().toISOString();
        a.stageHistory = [...a.stageHistory, { stage, at: new Date().toISOString() }];
        if (stage === 'ready') {
          a.completedAt = new Date().toISOString();
          const project = draft.projects.find((p) => p.id === a.projectId);
          if (project) {
            project.status = 'ready_for_install';
            // المركّب إن أُسند، وإلا فالقائس يعلم ريثما يُسنِد الأدمن مركّبًا
            const target = project.installerId ?? project.measurementWorkerId;
            if (target) {
              notify(
                draft,
                target,
                'ready_for_install',
                'جاهز للتركيب',
                `${project.title} - حدد موعد التركيب.`,
                `/project/${project.id}`,
              );
            }
            // M18: الجاهزية تصل الإدارة تلقائيًا من غير أن يتصل الخياط
            const tailorName =
              draft.profiles.find((p) => p.id === a.tailorId)?.fullName ?? 'الخياط';
            draft.profiles
              .filter((p) => p.role === 'admin')
              .forEach((admin) =>
                notify(
                  draft,
                  admin.id,
                  'ready_for_install',
                  'الورشة جاهزة',
                  `${tailorName} أنهى ${project.title} - جاهز للتركيب.`,
                  `/project/${project.id}`,
                ),
              );
          }
        } else {
          const project = draft.projects.find((p) => p.id === a.projectId);
          if (project && project.status === 'fabric_allocated') project.status = 'with_tailor';
        }
        audit(
          draft,
          'production.stage',
          'tailor_assignment',
          assignmentId,
          `تحديث مرحلة الإنتاج إلى: ${TAILOR_STAGE_LABELS[stage]}`,
        );
      });
      return okVoid;
    },
    [guard, db, mutate, notify, audit],
  );

  const assignTailor = useCallback(
    (projectId: UUID, tailorId: UUID, instructions: string, dueDate: string): Result<string> => {
      const id = uid('ta');
      mutate((draft) => {
        draft.tailorAssignments.unshift({
          id,
          organizationId: draft.organization.id,
          projectId,
          tailorId,
          stage: 'received',
          instructions,
          dueDate,
          startedAt: null,
          completedAt: null,
          stageHistory: [],
        });
        const project = draft.projects.find((p) => p.id === projectId);
        if (project) {
          project.tailorId = tailorId;
          project.status = 'with_tailor';
        }
        notify(
          draft,
          tailorId,
          'tailor_assignment',
          'مشروع جديد للخياطة',
          project ? `${project.title} - ${project.code}` : '',
          `/tailor/${id}`,
        );
        audit(draft, 'tailor.assign', 'tailor_assignment', id, 'إسناد مشروع للخياط');
      });
      return { ok: true, data: id };
    },
    [mutate, notify, audit],
  );

  // ── Payments ──────────────────────────────────────────────────────────────
  const recordPayment = useCallback(
    async (input: {
      projectId: UUID;
      amountAgorot: number;
      kind: PaymentKind;
      method: PaymentMethod;
      reference: string;
      note: string;
      dueAt?: string | null;
      photoUri?: string | null;
    }): Promise<Result<void>> => {
      const denied = guard('record_payment');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      if (!(input.amountAgorot > 0)) return failWith('المبلغ يجب أن يكون أكبر من صفر.', 'validation');
      // لا دفعة بلا عرض معتمد: بدونه لا مبلغ متفق عليه تُقاس عليه الدفعة،
      // فتظهر مستحقات وأرصدة لا أصل لها. القاعدة تُفرض في المحرك أيضًا حين
      // تُبنى دالة record_payment (انظر DECISIONS §11).
      {
        const approved = db.quotationVersions.some(
          (v) =>
            v.status === 'approved' &&
            db.quotations.some((q) => q.id === v.quotationId && q.projectId === input.projectId),
        );
        if (!approved) {
          return failWith(
            'لا يمكن تسجيل دفعة قبل اعتماد الزبون لعرض السعر - لا يوجد مبلغ متفق عليه بعد.',
            'conflict',
          );
        }
      }
      setBusy('payment');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const id = uid('pay');
        draft.payments.unshift({
          id,
          organizationId: draft.organization.id,
          projectId: input.projectId,
          amountAgorot: input.amountAgorot,
          kind: input.kind,
          method: input.method,
          dueAt: input.dueAt ?? null,
          photoUri: input.photoUri ?? null,
          reference: input.reference,
          note: input.note,
          reversedPaymentId: null,
          createdBy: userId ?? 'system',
          createdAt: new Date().toISOString(),
        });
        const project = draft.projects.find((p) => p.id === input.projectId);
        audit(
          draft,
          'payment.record',
          'payment',
          id,
          `تسجيل دفعة على مشروع ${project?.code ?? ''}`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, audit, userId],
  );

  /**
   * سلسلة شيكات دفعةً واحدة (M6).
   *
   * الشيكات تُستلم رزمةً في جلسة توقيع واحدة، فإدخالها واحدًا واحدًا خطأٌ
   * ينتظر من يرتكبه. التسلسل مرجع واحد CHK i/N فيُقرأ في كشف الدفعات أنها
   * رزمة، وقاعدة «لا دفعة قبل عرض معتمد» تسري عليها كما تسري على النقد.
   */
  const recordCheckSeries = useCallback(
    async (input: {
      projectId: UUID;
      checks: { amountAgorot: number; dueAt: string }[];
      note: string;
      photoUri?: string | null;
    }): Promise<Result<void>> => {
      const denied = guard('record_payment');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      if (input.checks.length === 0) return failWith('أدخل شيكًا واحدًا على الأقل.', 'validation');
      if (input.checks.some((c) => !(c.amountAgorot > 0)))
        return failWith('كل شيك يجب أن يكون مبلغه أكبر من صفر.', 'validation');
      const approved = db.quotationVersions.some(
        (v) =>
          v.status === 'approved' &&
          db.quotations.some((q) => q.id === v.quotationId && q.projectId === input.projectId),
      );
      if (!approved)
        return failWith(
          'لا يمكن تسجيل دفعة قبل اعتماد الزبون لعرض السعر - لا يوجد مبلغ متفق عليه بعد.',
          'conflict',
        );
      setBusy('payment');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const total = input.checks.length;
        input.checks.forEach((c, i) => {
          const id = uid('pay');
          draft.payments.unshift({
            id,
            organizationId: draft.organization.id,
            projectId: input.projectId,
            amountAgorot: c.amountAgorot,
            kind: 'milestone',
            method: 'check',
            dueAt: c.dueAt,
            // الصورة على الشيك الأول: هي صورة الرزمة الموقَّعة لا كل ورقة
            photoUri: i === 0 ? (input.photoUri ?? null) : null,
            reference: `CHK ${i + 1}/${total}`,
            note: input.note.trim(),
            reversedPaymentId: null,
            createdBy: userId ?? 'system',
            createdAt: new Date().toISOString(),
          });
        });
        const project = draft.projects.find((p) => p.id === input.projectId);
        const sum = input.checks.reduce((s, c) => s + c.amountAgorot, 0);
        audit(
          draft,
          'payment.checks',
          'payment',
          input.projectId,
          `تسجيل ${total} شيكات بمجموع ${Math.round(sum / 100)}₪ على ${project?.code ?? ''}`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, db.quotationVersions, db.quotations, mutate, audit, userId],
  );

  /**
   * دفعة لموظف (M8/M26): القيد الوحيد المخزَّن في دفتر الطاقم.
   *
   * الاستحقاق يُشتق من الورشات والزيارات ولا يُخزَّن، فالدفتر لا يفترق عن
   * مصدره. السلفة دفعةٌ عادية تسبق الاستحقاق فيهبط الرصيد تحت الصفر (M15) -
   * بلا معاملة خاصة. والموظف يصله إشعار بكل دفعة.
   */
  const recordStaffPayout = useCallback(
    async (staffId: UUID, amountAgorot: number, note: string): Promise<Result<void>> => {
      const denied = guard('manage_users');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      const staff = db.profiles.find((p) => p.id === staffId);
      if (!staff) return failWith('الموظف غير موجود.', 'validation');
      if (!(amountAgorot > 0)) return failWith('المبلغ يجب أن يكون أكبر من صفر.', 'validation');
      if (amountAgorot % 100 !== 0)
        return failWith('المبلغ بالشيكل الصحيح - لا أغورة.', 'validation');
      setBusy('payout');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const id = uid('slg');
        draft.staffLedger.unshift({
          id,
          organizationId: draft.organization.id,
          staffId,
          amountAgorot,
          note: note.trim(),
          createdBy: userId ?? 'system',
          createdAt: new Date().toISOString(),
        });
        notify(
          draft,
          staffId,
          'payment',
          'دفعة جديدة',
          `استلمت ${Math.round(amountAgorot / 100)}₪ من إدارة بيتك ديزاين${note.trim() ? ` - ${note.trim()}` : ''}.`,
          null,
        );
        audit(
          draft,
          'staff.payout',
          'staff_ledger',
          id,
          `دفعة ${Math.round(amountAgorot / 100)}₪ إلى ${staff.fullName}`,
        );
      });
      return okVoid;
    },
    [guard, requireOnline, db.profiles, mutate, notify, audit, userId],
  );

  const reversePayment = useCallback(
    async (paymentId: UUID, reason: string): Promise<Result<void>> => {
      const denied = guard('record_payment');
      if (denied) return denied;
      const offline = requireOnline();
      if (offline) return offline;
      if (!reason.trim()) return failWith('سبب العكس إلزامي.', 'validation');
      setBusy('reverse');
      await serverLatency();
      setBusy(null);
      mutate((draft) => {
        const original = draft.payments.find((p) => p.id === paymentId);
        if (!original) return;
        const id = uid('pay');
        draft.payments.unshift({
          id,
          organizationId: draft.organization.id,
          projectId: original.projectId,
          amountAgorot: -original.amountAgorot,
          kind: 'reversal',
          method: original.method,
          reference: original.reference,
          note: reason.trim(),
          reversedPaymentId: paymentId,
          createdBy: userId ?? 'system',
          createdAt: new Date().toISOString(),
        });
        audit(draft, 'payment.reverse', 'payment', id, `عكس دفعة - ${reason.trim()}`);
      });
      return okVoid;
    },
    [guard, requireOnline, mutate, audit, userId],
  );

  // ── Notifications / settings ──────────────────────────────────────────────
  const markNotificationRead = useCallback(
    (id: UUID) => {
      mutate((draft) => {
        draft.notifications = draft.notifications.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        );
      });
    },
    [mutate],
  );

  const markAllRead = useCallback(() => {
    mutate((draft) => {
      draft.notifications = draft.notifications.map((n) =>
        n.userId === userId && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
      );
    });
  }, [mutate, userId]);

  /**
   * تعديل أرقام التسعيرة الثابتة (شرط المالك: كل الأسعار من لوحته).
   *
   * تسري على العروض الجديدة وحدها - النسخ المرسلة مقفلة بحكم التصميم، فلا
   * يتغيّر سعرٌ وقّعه زبون بأثر رجعي.
   */
  const updateSettings = useCallback(
    (patch: Partial<BusinessSettings>): Result<void> => {
      const denied = guard('edit_pricing_rules');
      if (denied) return denied;
      const bad = Object.entries(patch).find(
        ([, v]) => typeof v === 'number' && (!Number.isFinite(v) || v < 0),
      );
      if (bad) return failWith('القيم يجب أن تكون أرقامًا غير سالبة.', 'validation');
      mutate((draft) => {
        Object.assign(draft.settings, patch);
        audit(
          draft,
          'settings.update',
          'business_settings',
          draft.organization.id,
          `تعديل التسعيرة: ${Object.keys(patch).join('، ')}`,
        );
      });
      return okVoid;
    },
    [guard, mutate, audit],
  );

  const updatePricingRule = useCallback(
    (ruleId: UUID, customerPricePerMeterAgorot: number, tailorCostPerMeterAgorot: number): Result<void> => {
      const denied = guard('edit_pricing_rules');
      if (denied) return denied;
      mutate((draft) => {
        draft.pricingRules = draft.pricingRules.map((r) =>
          r.id === ruleId ? { ...r, customerPricePerMeterAgorot, tailorCostPerMeterAgorot } : r,
        );
        audit(draft, 'pricing.update', 'pricing_rule', ruleId, 'تعديل قاعدة تسعير');
      });
      return okVoid;
    },
    [guard, mutate, audit],
  );

  const retryFailedOperations = useCallback(() => {
    mutate((draft) => {
      draft.operations = draft.operations.map((o) =>
        o.state === 'failed' ? { ...o, state: 'pending', error: null } : o,
      );
    });
  }, [mutate]);

  const resetDemo = useCallback(async () => {
    await AsyncStorage.removeItem(DB_KEY);
    setDb(buildSeed());
  }, []);

  return useMemo(
    () => ({
      db,
      hydrated,
      currentUser,
      role,
      isOnline,
      busy,
      source,
      enterLive,
      exitLive,
      setIsOnline,
      signIn,
      signOut,
      createCustomer,
      updateCustomer,
      archiveCustomer,
      createProfile,
      setProfileActive,
      createProject,
      updateProject,
      setProjectStatus,
      assignRole,
      addRoom,
      deleteRoom,
      saveWindow,
      deleteWindow,
      addAttachment,
      removeAttachment,
      scheduleVisit,
      updateVisit,
      startVisit,
      completeVisit,
      createQuotation,
      createVersion,
      sendVersion,
      decideVersion,
      requestDiscount,
      decideDiscount,
      reserveFabric,
      autoReserveForProject,
      releaseReservation,
      consumeFabric,
      completeWindow,
      adjustStock,
      saveFabricProduct,
      saveFabricVariant,
      addFabricRoll,
      createMiniRoll,
      advanceStage,
      assignTailor,
      recordPayment,
      recordCheckSeries,
      recordStaffPayout,
      reversePayment,
      markNotificationRead,
      markAllRead,
      updateSettings,
      updatePricingRule,
      retryFailedOperations,
      resetDemo,
      buildItems,
    }),
    [
      db,
      hydrated,
      currentUser,
      role,
      isOnline,
      busy,
      source,
      enterLive,
      exitLive,
      signIn,
      signOut,
      createCustomer,
      updateCustomer,
      archiveCustomer,
      createProfile,
      setProfileActive,
      createProject,
      updateProject,
      setProjectStatus,
      assignRole,
      addRoom,
      deleteRoom,
      saveWindow,
      deleteWindow,
      addAttachment,
      removeAttachment,
      scheduleVisit,
      updateVisit,
      startVisit,
      completeVisit,
      createQuotation,
      createVersion,
      sendVersion,
      decideVersion,
      requestDiscount,
      decideDiscount,
      reserveFabric,
      autoReserveForProject,
      releaseReservation,
      consumeFabric,
      completeWindow,
      adjustStock,
      saveFabricProduct,
      saveFabricVariant,
      addFabricRoll,
      createMiniRoll,
      advanceStage,
      assignTailor,
      recordPayment,
      recordCheckSeries,
      recordStaffPayout,
      reversePayment,
      markNotificationRead,
      markAllRead,
      updateSettings,
      updatePricingRule,
      retryFailedOperations,
      resetDemo,
      buildItems,
    ],
  );
});

export { TAILOR_STAGE_ORDER };
