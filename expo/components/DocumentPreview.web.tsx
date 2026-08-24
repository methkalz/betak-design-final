/**
 * معاينة الوثيقة - **الويب**: إطارٌ مرئيّ يعرض نفس الـHTML الذي يُطبع.
 *
 * ملفٌّ منفصل بلاحقة `.web` لا حارس `Platform` داخل ملفٍّ واحد: بذلك لا
 * تدخل `react-native-webview` حزمةَ الويب إطلاقًا - الحزّام يحسمها وقت
 * البناء لا وقت التشغيل.
 *
 * ★ `srcDoc` لا `src`: يحفظ الوثيقة معزولةً عن أنماط التطبيق - نفس السبب
 * الذي بُني عليه مسار الطباعة في `lib/exportDoc.ts`.
 *
 * ★ والتحجيم بـ`transform` لا بتغيير عرض الوثيقة: الوثيقة مقاسها A4 ثابت،
 * فتصغيرها بصريًّا يُبقي التناسب الذي سيُطبع. تغيير عرضها يُعيد تدفّق النصّ
 * فتصير المعاينة كذبةً أخرى.
 */
import React, { useState } from 'react';
import { View, type ViewStyle } from 'react-native';

import { palette, radius } from '@/constants/theme';

export const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

export function withPreviewViewport(html: string): string {
  return html;
}

export function DocumentPreview({ html, style }: { html: string; style?: ViewStyle }) {
  const [w, setW] = useState(0);
  // لا نكبّر أبدًا فوق المقاس الحقيقيّ: وثيقةٌ مكبَّرة تبدو أخشن مما ستُطبع
  const scale = w > 0 ? Math.min(1, w / A4_WIDTH) : 1;

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          overflow: 'hidden',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: palette.line,
          backgroundColor: palette.white,
          height: A4_HEIGHT * scale,
        },
        style,
      ]}
    >
      {w > 0 && (
        <iframe
          title="معاينة عرض السعر"
          srcDoc={html}
          style={{
            width: A4_WIDTH,
            height: A4_HEIGHT / scale,
            border: 0,
            transform: `scale(${scale})`,
            // مبدأ التحجيم من الأعلى ومن جهة بدء القراءة (يمين في RTL)
            transformOrigin: 'top right',
            display: 'block',
          }}
        />
      )}
    </View>
  );
}
