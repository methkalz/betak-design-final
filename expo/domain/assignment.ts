/**
 * إسناد المشروع - من يقيس، ومن يخيط، ومن يركّب.
 *
 * ثلاثة أدوار لا اثنان: القياس والتركيب زيارتان تفصل بينهما أسابيع، وقد
 * يقوم بهما شخصان. توحيدهما في حقل واحد كان يُلزم بما لا تُلزم به الورشة.
 *
 * وتوقيت كل إسناد يتبع اللحظة التي يصير فيها ضروريًا:
 * - **الخياط**: عند الإنشاء. المشروع الذي لا يُعرف منفّذه يصل مرحلة العمل
 *   فيقف، فالإلزام في أوله أرحم من الوقوف في وسطه.
 * - **القائس**: عند الإنشاء أيضًا - موعد القياس يُحجز معه، وزيارةٌ بلا
 *   صاحب لا تحدث.
 * - **المركّب**: متى شئت. التركيب بعيد، وقد لا يُعرف من يفرغ له اليوم.
 *   يصير ضروريًا فقط حين يُنهي الخياط ويدخل المشروع «جاهز للتركيب».
 */
import type { Database } from '@/data/seed';
import type { Project, UUID } from '@/types/domain';

export type AssignmentKind = 'measurement' | 'installation' | 'tailor';

export type AssignmentGap = {
  projectId: UUID;
  kind: Exclude<AssignmentKind, 'tailor'>;
  /** ما الذي يتوقف فعلًا بسبب هذا النقص. */
  blocks: string;
};

/** هل بلغ المشروع المرحلة التي يصير فيها المركّب ضروريًا؟ */
export function needsInstaller(project: Project): boolean {
  return (
    !project.installerId &&
    (project.status === 'ready_for_install' || project.status === 'installed')
  );
}

/** هل ينقصه قائس والقياس لم يتم بعد؟ */
export function needsMeasurer(project: Project): boolean {
  const beforeMeasured =
    project.status === 'new_request' || project.status === 'awaiting_measurement';
  return !project.measurementWorkerId && beforeMeasured;
}

/**
 * فجوات الإسناد المفتوحة - ما يعرضه الأدمن على لوحته.
 * لا يُبلَّغ عن نقصٍ لم يحن وقته: مشروع في مرحلة العرض لا يُلام على غياب
 * مركّب، وإلا امتلأت اللوحة بتنبيهات لا فعل لها.
 */
export function assignmentGaps(db: Database): AssignmentGap[] {
  const out: AssignmentGap[] = [];
  for (const p of db.projects) {
    if (p.status === 'completed') continue;
    if (needsMeasurer(p)) {
      out.push({ projectId: p.id, kind: 'measurement', blocks: 'زيارة القياس لن تحدث' });
    }
    if (needsInstaller(p)) {
      out.push({ projectId: p.id, kind: 'installation', blocks: 'التركيب لن يُجدوَل' });
    }
  }
  return out;
}

/** الأدوار التي يشغلها موظف على مشروع - لإحصاء «مشاريع مسندة إليه». */
export function projectsAssignedTo(db: Database, staffId: UUID): Project[] {
  return db.projects.filter(
    (p) =>
      p.measurementWorkerId === staffId || p.installerId === staffId || p.tailorId === staffId,
  );
}
