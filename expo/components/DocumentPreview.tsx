/**
 * معاينة الوثيقة - **الأصليّ**: WebView تعرض نفس الـHTML الذي يُطبع.
 *
 * ## العطب الذي تعالجه
 *
 * كانت الشاشة ترسم **تقريبًا بمكوّنات RN** لا الوثيقة نفسها: تُظهر سطر خصمٍ
 * لا وجود له في الـPDF، ولا تُظهر السعر المشطوب، ولا تعرف القوالب الاثني
 * عشر إطلاقًا. فما يراه البائع ليس ما يستلمه الزبون - وهو أسوأ ما يقع في
 * شاشة معاينة.
 *
 * الآن مصدرٌ واحد: `buildQuoteHtml` هي الحقيقة، وتُعرَض كما هي.
 *
 * ★ نسخة الويب في `DocumentPreview.web.tsx` تستعمل `iframe` لا WebView -
 * فصلٌ بالملفّ لا بحارس `Platform`، كي لا تدخل الحزمة الأصليّة حزمةَ الويب.
 */
import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { palette, radius } from '@/constants/theme';

/**
 * الوثيقة مصمَّمة على عرض A4 (794px) ولا تحمل `viewport` - وهذا صحيح: هي
 * ورقةُ طباعةٍ لا صفحةُ ويب. فتُحقن هنا **للعرض وحده**، ولا تمسّ النصّ الذي
 * يذهب إلى الطباعة والتصدير.
 */
export const A4_WIDTH = 794;

export function withPreviewViewport(html: string): string {
  return html.replace(
    '<meta charset="utf-8" />',
    `<meta charset="utf-8" /><meta name="viewport" content="width=${A4_WIDTH}" />`,
  );
}

export function DocumentPreview({ html, style }: { html: string; style?: ViewStyle }) {
  return (
    <View
      style={[
        { flex: 1, overflow: 'hidden', borderRadius: radius.md,
          borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white },
        style,
      ]}
    >
      <WebView
        originWhitelist={['*']}
        source={{ html: withPreviewViewport(html) }}
        style={{ flex: 1, backgroundColor: palette.white }}
        // وثيقةٌ محلّية بلا شبكة: لا ملاحة ولا نصوصٌ خارجية
        javaScriptEnabled={false}
        scrollEnabled
        showsVerticalScrollIndicator
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('data:')}
      />
    </View>
  );
}
