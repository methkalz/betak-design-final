/**
 * صورة الاسم.
 *
 * القرار بعد مراجعة ما تفعله أدوات العمل الجادة (Google وSlack وLinear
 * وAtlassian): الحرفان على لونٍ مشتقّ من هوية الشخص، لا صورة.
 *
 * الخياران الآخران يكلّفان أكثر مما يعطيان. الشخصيات ثلاثية الأبعاد تُوزَّع
 * عشوائيًا فتفقد ثباتها: الزبون نفسه قد يظهر بوجهين على جهازين، فتصير
 * الصورة زينةً لا تعريفًا - ولهجتها المرحة تجاور مبالغ وعروض أسعار مطبوعة.
 * والصورة الموحّدة على طريقة فيسبوك أسوأ في قائمة: كل السطور تصبح متطابقة،
 * فتأكل الدائرة مساحةً دون أن تفرّق بين أحد وأحد.
 *
 * أما اللون المشتقّ من المعرّف فثابت لا يتغيّر أبدًا، ويجعل الزبون يُعرف من
 * طرف العين قبل قراءة اسمه. والتنفيذ هنا يرفعه فوق الدائرة المصمتة: تدرّج
 * فاتح رقيق، وحلقة شعرة بلون الهوية، والحرفان بلونها المشبع.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { palette } from '@/constants/theme';
import { initials } from '@/lib/format';

/** ثماني هويات متمايزة بوضوح ومتناغمة مع لغة التطبيق النيلية. */
const TONES = [
  { from: '#EEF0FF', to: '#DFE3FD', ink: '#4338CA' },
  { from: '#E7F6FF', to: '#D6EBFD', ink: '#0369A1' },
  { from: '#E4F8F0', to: '#D2F1E5', ink: '#047857' },
  { from: '#FFF3E3', to: '#FCE7CB', ink: '#B45309' },
  { from: '#FFEDF1', to: '#FCDCE4', ink: '#BE123C' },
  { from: '#F4ECFF', to: '#E8DBFE', ink: '#6D28D9' },
  { from: '#FFEFEB', to: '#FCDFD8', ink: '#C2410C' },
  { from: '#EDF3E9', to: '#DEEAD7', ink: '#4D7C0F' },
] as const;

/** المعرّف لا الاسم: تغيير الاسم لا يجوز أن يبدّل هوية الشخص البصرية. */
function toneOf(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return TONES[Math.abs(h) % TONES.length];
}

export function Avatar({
  id,
  name,
  size = 46,
  onDark = false,
  style,
}: {
  /** المعرّف الثابت للشخص - مصدر اللون. */
  id: string;
  name: string;
  size?: number;
  /** فوق خلفية داكنة: زجاج أبيض شفيف بدل اللون، ليبقى مقروءًا. */
  onDark?: boolean;
  style?: ViewStyle;
}) {
  const tone = toneOf(id);
  const shell: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };
  // الحرفان يشغلان نحو ثلثي القطر - نسبة تبقى متزنة من 32 إلى 72
  const fontSize = Math.round(size * 0.36);

  if (onDark) {
    return (
      <View style={[shell, { backgroundColor: 'rgba(255,255,255,0.16)' }, style]}>
        <AppText variant="label" color={palette.ivory} style={{ fontSize }}>
          {initials(name)}
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={[shell, { borderWidth: 1, borderColor: tone.to }, style]}
    >
      <LinearGradient
        colors={[tone.from, tone.to]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <AppText variant="label" color={tone.ink} style={{ fontSize }}>
        {initials(name)}
      </AppText>
    </View>
  );
}
