/**
 * زر التقدّم إلى المرحلة التالية.
 *
 * الممارسة المعتمدة: إجراء أساسي بارز وواضح الوجهة، لا نقرٌ على عنصر صغير
 * داخل قائمة. السهمان يتحركان لا زخرفةً بل ليقولا «اضغط هنا للانتقال»، وهي
 * إشارة الإمكانية (affordance) التي تغيب حين يكون النقل مخبوءًا في سطر.
 *
 * مشترك بين لوحة الأدمن ولوحة الخياط: المرحلة تتقدّم بالطريقة نفسها أيًّا كان
 * من يقدّمها.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppText, Row } from '@/components/ui';
import { gradients, palette, radius, spacing } from '@/constants/theme';

export function AdvanceButton({
  label,
  onPress,
  caption = 'المرحلة التالية',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  caption?: string;
  disabled?: boolean;
}) {
  // سهمان يتتابعان لا قرص يتحرك: الحركة يجب أن تكون في الرمز الدال على
  // الاتجاه نفسه. التأخير بين السهمين يصنع إحساس التدفق نحو الأمام.
  const x1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  useEffect(() => {
    if (disabled) return;
    const cycle = { duration: 620, easing: Easing.inOut(Easing.quad) };
    x1.value = withRepeat(withTiming(-9, cycle), -1, true);
    x2.value = withDelay(140, withRepeat(withTiming(-9, cycle), -1, true));
  }, [x1, x2, disabled]);
  const nudge1 = useAnimatedStyle(() => ({ transform: [{ translateX: x1.value }] }));
  const nudge2 = useAnimatedStyle(() => ({ transform: [{ translateX: x2.value }] }));

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        disabled && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      <LinearGradient
        colors={gradients.indigo as unknown as [string, string]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Row justify="space-between" style={{ flex: 1 }}>
        <View>
          <AppText variant="caption" color="rgba(255,255,255,0.75)">
            {caption}
          </AppText>
          <AppText variant="heading" color={palette.white}>
            {label}
          </AppText>
        </View>
        <View style={styles.arrows}>
          <Animated.View style={nudge1}>
            <ChevronLeft size={28} color={palette.white} />
          </Animated.View>
          <Animated.View style={[nudge2, { marginRight: -16 }]}>
            <ChevronLeft size={28} color="rgba(255,255,255,0.55)" />
          </Animated.View>
        </View>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 68,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  arrows: { flexDirection: 'row', alignItems: 'center' },
});
