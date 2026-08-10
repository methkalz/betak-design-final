/**
 * علامة الشخص - بلا حروف.
 *
 * الحرفان الأولان في العربية يتصادفان أحيانًا على كلمة غير لائقة، وهذا وحده
 * يكفي لإسقاط الفكرة: صورةٌ قد تسيء لزبون مرة واحدة أسوأ من صورة لا تقول
 * شيئًا أبدًا. والصورة الموحّدة على طريقة فيسبوك تجعل كل سطور القائمة
 * متطابقة فتفقد الدائرة وظيفتها. والشخصيات الجاهزة تُوزَّع عشوائيًا فلا
 * تثبت هوية أحد.
 *
 * فالعلامة هنا شكلٌ مجرّد يُولَّد من معرّف الشخص: ثابت لا يتغيّر، فريد
 * لكل واحد، يُميَّز من طرف العين في قائمة طويلة، ولا يحمل حرفًا واحدًا.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { palette } from '@/constants/theme';

/** ثماني عائلات لونية ناعمة، كلٌّ منها ثلاث درجات متناغمة. */
const FAMILIES = [
  ['#E0E7FF', '#A5B4FC', '#6366F1'],
  ['#DBEEFE', '#7DD3FC', '#0EA5E9'],
  ['#D5F5E6', '#6EE7B7', '#10B981'],
  ['#FDF0D5', '#FCD34D', '#F59E0B'],
  ['#FEE1E6', '#FDA4AF', '#F43F5E'],
  ['#EAE2FE', '#C4B5FD', '#8B5CF6'],
  ['#FEE7D6', '#FDBA74', '#F97316'],
  ['#E9F5D8', '#BEF264', '#84CC16'],
] as const;

/**
 * عدّاد شبه عشوائي مشتقّ من نصّ - ثابت تمامًا لنفس المعرّف على كل جهاز.
 * (المعرّف لا الاسم: تغيير اسم الزبون لا يجوز أن يبدّل علامته.)
 */
function seeded(seed: string): (i: number) => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (i: number) => {
    let x = (h + i * 0x9e3779b9) >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

export function Avatar({
  id,
  name,
  size = 46,
  onDark = false,
  style,
}: {
  /** المعرّف الثابت للشخص - منه تُولَّد العلامة. */
  id: string;
  /** للقارئ الصوتي فقط - لا يُرسم. */
  name: string;
  size?: number;
  /** فوق خلفية داكنة: حلقة بيضاء رفيعة تفصل العلامة عن الخلفية. */
  onDark?: boolean;
  style?: ViewStyle;
}) {
  const r = seeded(id);
  const family = FAMILIES[Math.floor(r(0) * FAMILIES.length) % FAMILIES.length];

  // دائرتان كبيرتان يخرج معظمهما خارج الإطار، فما يظهر منهما أقواسٌ لينة
  // لا أقراص محدّدة - وهذا ما يعطي الشكل نعومته بدل أن يبدو رسمًا هندسيًا.
  const a = { cx: 20 + r(1) * 44, cy: 18 + r(2) * 40, rad: 30 + r(3) * 16 };
  const b = { cx: 16 + r(4) * 48, cy: 30 + r(5) * 44, rad: 20 + r(6) * 14 };

  return (
    <View
      accessibilityLabel={name}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: palette.sand,
          borderWidth: 1,
          borderColor: onDark ? 'rgba(255,255,255,0.35)' : palette.line,
        },
        style,
      ]}
    >
      {/* القصّ من الغلاف (`overflow: hidden` + نصف قطر) لا من ClipPath داخل
          الـSVG: معرّفات ClipPath عالمية على الويب فتتصادم حين تظهر عدة
          علامات في قائمة واحدة. */}
      <Svg width="100%" height="100%" viewBox="0 0 80 80">
        <Rect x={0} y={0} width={80} height={80} fill={family[0]} />
        <Circle cx={a.cx} cy={a.cy} r={a.rad} fill={family[1]} />
        <Circle cx={b.cx} cy={b.cy} r={b.rad} fill={family[2]} opacity={0.9} />
      </Svg>
    </View>
  );
}
