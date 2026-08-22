/**
 * توقيع المزوّد - **نسخة الويب وحدها**.
 *
 * `Platform.OS !== 'web'` حارسٌ قاطع لا تفضيلَ عرضٍ يُضبط بالعرض: تطبيق
 * المتجر لا يحمل توقيعًا خارجيًّا، والشجرة على الأصليّ تعود بلا عنصرٍ زائد
 * كما كانت. ولذلك لا يُقاس بـ`useResponsive` - فمتصفّح الهاتف ويبٌ أيضًا
 * ويستحقّ التوقيع، ونافذةٌ مصغّرة على الحاسوب كذلك.
 *
 * والفتح في نافذةٍ جديدة ليس خيارًا نمرّره: `Linking.openURL` على
 * react-native-web يستعمل `_blank` افتراضًا ويضيف `noopener` - فالمستخدم لا
 * يفقد جلسته، والصفحة المفتوحة لا تملك مرجعًا إلى نافذتنا.
 */
import { Linking, Platform, Pressable } from 'react-native';

import { AppText, Row } from '@/components/ui';
import { palette, spacing } from '@/constants/theme';

const QINOVA_URL = 'https://qinova.net';

/**
 * `onDark` لشاشة الدخول: خلفيّتها تدرّجٌ زيتونيّ داكن، و`palette.muted`
 * عليها رماديٌّ على داكن - نصٌّ لا يُقرأ. تُستعمل نفس ألوان بقيّة نصوص تلك
 * الشاشة (sage/ivory) فيبقى التباين كما ضُبط هناك أصلًا.
 */
export function PoweredBy({
  align = 'center',
  tone = 'onLight',
}: {
  align?: 'center' | 'flex-start';
  tone?: 'onLight' | 'onDark';
}) {
  if (Platform.OS !== 'web') return null;

  const dark = tone === 'onDark';
  const labelColor = dark ? palette.sage : palette.muted;
  const nameColor = dark ? palette.ivory : palette.olive;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="powered by Qinova - يفتح في نافذة جديدة"
      onPress={() => {
        Linking.openURL(QINOVA_URL).catch(() => {});
      }}
      style={(s) => {
        // ‏react-native-web يمرّر hovered مع pressed؛ أنواع RN لا تعرفها بعد،
        // وهي undefined أصليًّا فيسقط الشرط بلا أثر (عُرف SidebarItem نفسه).
        const st = s as { pressed: boolean; hovered?: boolean };
        return {
          alignSelf: align,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          opacity: st.hovered || st.pressed ? 1 : 0.75,
        };
      }}
    >
      {/* سطرٌ لاتينيّ داخل تخطيطٍ يبدأ من اليمين: يُلفّ بصفٍّ عاديّ لا
          بـRTL_ROW، فيقرأ «powered by» ثمّ «Qinova» بترتيبهما الطبيعي. */}
      <Row gap={4} style={{ flexDirection: 'row' }}>
        <AppText variant="caption" color={labelColor}>
          powered by
        </AppText>
        <AppText variant="caption" color={nameColor}>
          Qinova
        </AppText>
      </Row>
    </Pressable>
  );
}
