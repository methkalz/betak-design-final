/**
 * بطاقة اختيار قالب الوثيقة - صورةٌ مصغّرة ولوحُ ألوان.
 *
 * **لماذا مصغّرةٌ مرسومة لا معاينةٌ حقيقيّة**: عرضُ اثني عشر قالبًا كوثائق
 * HTML حقيقيّة يعني اثني عشر WebView/إطارًا في شاشةٍ واحدة - ثقلٌ لا يحتمله
 * هاتف، وكلٌّ منها يحمل خطًّا مضمَّنًا بحجم 100KB. المصغّرة هنا **رسمٌ
 * تخطيطيّ** بمكوّنات RN: تنقل الإيماءة (شريط، لوح، توسيط، علامة مائيّة،
 * نسيج، طيّات…) واللون والكثافة - وهي ما يقرّر عليه المستخدم فعلًا.
 *
 * والمعاينة الحقيقيّة تبقى متاحةً بضغطةٍ من شاشة العرض؛ هذه للاختيار السريع.
 *
 * ★ النسبة 1:1.414 نسبة A4 نفسها، فما يراه المستخدم هنا يتناسب مع الورقة.
 */
import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText, RTL_ROW } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { QUOTE_THEMES, type QuoteTemplate } from '@/domain/quoteThemes';

const W = 78;
const H = Math.round(W * 1.414);

/** سطرٌ رماديّ يمثّل نصًّا في المصغّرة. */
function Line({ w, c, h = 2.5, mt = 3 }: { w: number | string; c: string; h?: number; mt?: number }) {
  return <View style={{ width: w as number, height: h, backgroundColor: c, marginTop: mt, borderRadius: 1 }} />;
}

/** جسم الوثيقة: بضعة أسطرٍ ثمّ كتلة الإجمالي - مشترَكٌ بين كلّ المصغّرات. */
function Body({ ink, line, accent, totalBlock }: {
  ink: string; line: string; accent: string; totalBlock: boolean;
}) {
  return (
    <View style={{ paddingHorizontal: 7, paddingTop: 5, flex: 1 }}>
      <Line w={30} c={ink} h={2.5} mt={0} />
      <Line w={'100%'} c={line} h={1} mt={5} />
      {[46, 52, 40, 48].map((w, i) => (
        <View key={i} style={{ flexDirection: RTL_ROW, alignItems: 'center', marginTop: 4 }}>
          <Line w={w} c={line} h={2} mt={0} />
          <View style={{ flex: 1 }} />
          <Line w={12} c={line} h={2} mt={0} />
        </View>
      ))}
      <View style={{ flex: 1 }} />
      {totalBlock ? (
        <View style={{ height: 9, backgroundColor: accent, borderRadius: 1.5, marginBottom: 6 }} />
      ) : (
        <View style={{ marginBottom: 6 }}>
          <View style={{ height: 1.5, backgroundColor: accent }} />
          <Line w={30} c={accent} h={4} mt={3} />
        </View>
      )}
    </View>
  );
}

/** الإيماءة المميّزة لكلّ تخطيط - هي ما يفرّق قالبًا عن آخر في اللمحة. */
function Gesture({ id }: { id: QuoteTemplate }) {
  const t = QUOTE_THEMES[id];
  const a = t.accent;
  const box = { position: 'absolute' as const, top: 0, insetInlineStart: 0, insetInlineEnd: 0 };

  switch (t.layout) {
    case 'band': // لوحٌ داكن ممتدّ + خيط ذهب
      return (
        <View style={[box, { height: 26, backgroundColor: a }]}>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
            backgroundColor: t.second ?? a }} />
        </View>
      );
    case 'display': // رقمٌ طباعيّ ضخم
      return (
        <View style={{ paddingHorizontal: 7, paddingTop: 8 }}>
          <Line w={22} c={t.inkMuted} h={2} mt={0} />
          <Line w={44} c={a} h={11} mt={4} />
        </View>
      );
    case 'panel': // لوحٌ جانبيّ
      return (
        <View style={{ position: 'absolute', top: 0, bottom: 0, insetInlineEnd: 0,
          width: 26, backgroundColor: a }} />
      );
    case 'centered': // توسيطٌ وخطٌّ مزدوج
      return (
        <View style={{ paddingTop: 9, alignItems: 'center' }}>
          <View style={{ width: 14, height: 5, backgroundColor: a, borderRadius: 1 }} />
          <Line w={34} c={t.ink} h={3} mt={4} />
          <View style={{ width: '76%', height: 3, borderTopWidth: 1.2, borderBottomWidth: .8,
            borderColor: a, marginTop: 5 }} />
        </View>
      );
    case 'rule': // قاعدةٌ سوداء
      return <View style={[box, { height: 4, backgroundColor: a }]} />;
    case 'strip': // شريطٌ نحيل
      return <View style={[box, { height: 9, backgroundColor: a }]} />;
    case 'ghost': // ظلٌّ طباعيّ
      return (
        <View style={{ paddingTop: 8, paddingHorizontal: 7 }}>
          <Line w={40} c={a + '22'} h={16} mt={0} />
        </View>
      );
    case 'slim': // رأسٌ نحيل
      return (
        <View style={{ paddingTop: 7, paddingHorizontal: 7 }}>
          <Line w={30} c={t.ink} h={3} mt={0} />
          <View style={{ height: 1.5, backgroundColor: a, marginTop: 4 }} />
        </View>
      );
    case 'seal': // علامةٌ مائيّة ضخمة خلف المتن
      return (
        <View style={[box, { bottom: 0, alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: a, opacity: 0.1 }} />
        </View>
      );
    case 'weave': // شعارٌ متكرّر نسيجًا
      return (
        <View style={[box, { bottom: 0, flexDirection: 'row', flexWrap: 'wrap',
          paddingHorizontal: 4, paddingTop: 6 }]}>
          {Array.from({ length: 24 }, (_, i) => (
            <View key={i} style={{ width: 6, height: 8, margin: 3.5, borderRadius: 1,
              backgroundColor: a, opacity: 0.14 }} />
          ))}
        </View>
      );
    case 'curve': // دوائر ناعمة
      return (
        <View style={[box, { height: 44, overflow: 'hidden' }]}>
          <View style={{ position: 'absolute', top: -30, insetInlineEnd: -18, width: 62, height: 62,
            borderRadius: 31, backgroundColor: a, opacity: 0.13 }} />
          <View style={{ position: 'absolute', top: -8, insetInlineEnd: 16, width: 30, height: 30,
            borderRadius: 15, backgroundColor: a, opacity: 0.18 }} />
        </View>
      );
    case 'folds': // طيّات ستارة
      return (
        <View style={[box, { bottom: 0, flexDirection: 'row' }]}>
          {Array.from({ length: 8 }, (_, i) => (
            <View key={i} style={{ width: 3, backgroundColor: a, opacity: 0.12, marginEnd: 6.4 }} />
          ))}
        </View>
      );
    default:
      return null;
  }
}

export function QuoteTemplateCard({
  id, active, onPress,
}: { id: QuoteTemplate; active: boolean; onPress: () => void }) {
  const t = QUOTE_THEMES[id];
  // لوح الألوان: القائد وعمقه وتظليله والورق - أربعةٌ تكفي لقراءة المزاج
  const swatches = [t.accent, t.accentDeep, t.accentSoft, t.paper];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={t.labelAr}
      style={{
        alignItems: 'center',
        padding: spacing.sm,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: active ? palette.olive : 'transparent',
        backgroundColor: active ? palette.sand : 'transparent',
      }}
    >
      <View
        style={{
          width: W, height: H, backgroundColor: t.paper, overflow: 'hidden',
          borderRadius: 3, borderWidth: 1, borderColor: palette.line,
        }}
      >
        <Gesture id={id} />
        <View style={{ flex: 1, paddingTop: t.layout === 'panel' ? 6 : 28 }}>
          <Body ink={t.ink} line={t.line} accent={t.accent} totalBlock={t.totalStyle === 'block'} />
        </View>
      </View>

      <AppText variant="caption" style={{ marginTop: 5, fontWeight: active ? '700' : '400' }}>
        {t.labelAr}
      </AppText>

      <View style={{ flexDirection: RTL_ROW, gap: 3, marginTop: 3 }}>
        {swatches.map((c, i) => (
          <View
            key={i}
            style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c,
              borderWidth: 1, borderColor: palette.line }}
          />
        ))}
      </View>
    </Pressable>
  );
}
