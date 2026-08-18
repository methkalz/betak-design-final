/**
 * صور شيكٍ واحد: عرضها، وإضافة المزيد بعد تسجيله.
 *
 * الصورة اختيارية بقرار المالك، فقد يُسجَّل الشيك اليوم وتُصوَّر ورقته غدًا -
 * أو يتعذّر رفعها ساعةَ التسجيل. هذا هو الطريق الثاني إليها، وهو نفسه طريق
 * التصحيح حين يفشل رفعٌ في المعالج.
 *
 * ولا تظهر إلا لمن يرى المال: سياسة الخادم تحجب صور الشيكات عن غير الإدارة
 * والمبيعات (فيها حساب الزبون وتوقيعه)، والشاشة تقول ما تقوله القاعدة.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Images } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SignedImage } from '@/components/SignedImage';
import { AppText, Row } from '@/components/ui';
import { palette, radius, spacing } from '@/constants/theme';
import { useStore } from '@/providers/store';
import type { Payment } from '@/types/domain';

async function compress(uri: string): Promise<string | null> {
  for (const format of [ImageManipulator.SaveFormat.WEBP, ImageManipulator.SaveFormat.JPEG]) {
    try {
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.55, format },
      );
      return out.uri;
    } catch {
      // iOS لا يشفّر webp - يُعاد بـjpeg
    }
  }
  return null;
}

export function CheckPhotos({ payment }: { payment: Payment }) {
  const { db, role, addAttachment, busy } = useStore();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSeeMoney = role === 'admin' || role === 'sales';
  if (!canSeeMoney || payment.method !== 'check') return null;

  const photos = db.attachments.filter((a) => a.paymentId === payment.id);

  const add = async (from: 'camera' | 'library') => {
    setError(null);
    setOpen(false);
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('لا إذن للكاميرا.');
    }
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true });
    if (res.canceled || res.assets.length === 0) return;
    for (const asset of res.assets) {
      const small = await compress(asset.uri);
      if (!small) {
        setError('تعذر تجهيز الصورة.');
        continue;
      }
      const r = await addAttachment({
        projectId: payment.projectId,
        paymentId: payment.id,
        kind: 'check',
        uri: small,
        caption: `صورة ${payment.reference || 'الشيك'}`,
      });
      if (!r.ok) setError(r.error);
    }
  };

  return (
    <View style={{ marginTop: 6 }}>
      {photos.length > 0 && (
        <Row gap={spacing.sm} style={{ flexWrap: 'wrap', marginBottom: 6 }}>
          {photos.map((a) => (
            <SignedImage key={a.id} uri={a.uri} style={styles.thumb} contentFit="cover" />
          ))}
        </Row>
      )}

      {open ? (
        <Row gap={spacing.sm}>
          <Pressable onPress={() => add('camera')} style={styles.pill} disabled={busy === 'attach'}>
            <Camera size={13} color={palette.olive} />
            <AppText variant="caption" color={palette.olive}>تصوير</AppText>
          </Pressable>
          <Pressable onPress={() => add('library')} style={styles.pill} disabled={busy === 'attach'}>
            <Images size={13} color={palette.olive} />
            <AppText variant="caption" color={palette.olive}>من المعرض</AppText>
          </Pressable>
        </Row>
      ) : (
        <Pressable onPress={() => setOpen(true)} hitSlop={6}>
          <AppText variant="caption" color={palette.olive}>
            {photos.length > 0 ? 'أضف صورة أخرى' : 'أضف صورة الشيك (اختياري)'}
          </AppText>
        </Pressable>
      )}

      {!!error && (
        <AppText variant="caption" color={palette.danger} style={{ marginTop: 4 }}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: palette.sand },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1.4,
    borderColor: palette.line,
  },
});
