/**
 * قرار الزبون على العرض - مصدر واحد لثلاثة أماكن.
 *
 * كان القرار متاحًا في شاشة العرض وحدها، بينما تبويب «عرض السعر» داخل
 * المشروع يعرض النسخة نفسها بلا أزرار. فبدا للمستخدم أن أمامه نسختين
 * مختلفتين من الشيء ذاته تبعًا للباب الذي دخل منه. هذا المكوّن يخدم شاشة
 * العرض وتبويب المشروع ولوحة الأدمن معًا، فلا يمكن أن تفترق ثلاثتها مجددًا.
 *
 * وهو أيضًا الموضع الذي يجري فيه الحجز التلقائي، لأن الاعتماد هو الحدث الذي
 * يوجبه - أينما وقع.
 */
import { CheckCircle2, Pencil, XCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Banner, Field, Row } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';

export function QuotationDecision({
  versionId,
  projectId,
  onApproved,
  onEdit,
  compact = false,
}: {
  versionId: string;
  projectId: string;
  /** ما يفعله المضيف بعد نجاح الاعتماد - انتقال أو تبديل تبويب. */
  onApproved: () => void;
  onEdit: () => void;
  /** نسخة مصغّرة لبطاقات اللوحة. */
  compact?: boolean;
}) {
  const { decideVersion, autoReserveForProject, busy } = useStore();
  const [error, setError] = useState<string | null>(null);
  // الرفض يشترط سببه (الخادم يرفض بدونه): الضغطة الأولى تفتح الحقل،
  // والتأكيد يرسل - فلا نموذج يُرفض آخره ولا سببٌ يضيع
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [rejectNote, setRejectNote] = useState<string>('');
  const working = busy === 'decide-quote' || busy === 'reserve';

  const approve = async () => {
    setError(null);
    const res = await decideVersion(versionId, 'approved');
    if (!res.ok) return setError(res.error);
    // النقص لا يُبلَّغ هنا: تبويب القماش هو من يشرحه بالأرقام، والانتقال
    // إليه جزء من الاعتماد أصلًا.
    await autoReserveForProject(projectId);
    onApproved();
  };

  const reject = async () => {
    setError(null);
    if (!rejecting) {
      setRejecting(true);
      return;
    }
    const res = await decideVersion(versionId, 'rejected', rejectNote);
    if (!res.ok) return setError(res.error);
    setRejecting(false);
    setRejectNote('');
  };

  const size = compact ? 17 : 19;

  return (
    <View style={{ gap: spacing.sm }}>
      <Row gap={spacing.sm}>
        <Decide
          disabled={working}
          onPress={approve}
          compact={compact}
          icon={<CheckCircle2 size={size} color={palette.success} />}
          label={compact ? 'وافق' : 'الزبون وافق'}
        />
        <Decide
          disabled={working}
          onPress={reject}
          compact={compact}
          icon={<XCircle size={size} color={palette.danger} />}
          label={compact ? 'رفض' : 'رفض العرض'}
        />
        <Decide
          disabled={working}
          onPress={onEdit}
          compact={compact}
          icon={<Pencil size={size - 2} color={palette.olive} />}
          label={compact ? 'تعديل' : 'تعديل العرض'}
        />
      </Row>
      {!!error && <Banner tone="danger" title="تعذر تسجيل القرار" body={error} />}
    </View>
  );
}

/** سطح أبيض وحدّ رفيع، واللون في الأيقونة وحدها. */
function Decide({
  icon,
  label,
  onPress,
  disabled,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { minHeight: compact ? 44 : 52 },
        pressed && { backgroundColor: palette.sand },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Row gap={compact ? 6 : spacing.sm} justify="center">
        {icon}
        <AppText variant={compact ? 'caption' : 'label'}>{label}</AppText>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.4,
    borderColor: palette.line,
    backgroundColor: palette.white,
  },
});
