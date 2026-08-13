/**
 * صورة تعرف مصدرها: الروابط المحلية والعامة تُعرض كما هي (الديمو
 * والملفات الملتقطة للتو)، ومسارات المخزن تُستبدل برابطٍ موقّت من
 * الخادم - فالدلو خاص، لا روابط عامة لصور بيوت الزبائن.
 */
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { palette } from '@/constants/theme';
import { signedAttachmentUrl } from '@/lib/storage';

const isDirect = (uri: string) =>
  uri.startsWith('http') || uri.startsWith('file:') || uri.startsWith('data:');

export function SignedImage({
  uri,
  style,
  contentFit,
  transition,
}: {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}) {
  const [url, setUrl] = useState<string | null>(isDirect(uri) ? uri : null);

  useEffect(() => {
    let alive = true;
    if (isDirect(uri)) {
      setUrl(uri);
      return undefined;
    }
    setUrl(null);
    signedAttachmentUrl(uri).then((signed) => {
      if (alive) setUrl(signed);
    });
    return () => {
      alive = false;
    };
  }, [uri]);

  if (!url)
    return (
      <View style={[{ backgroundColor: palette.ivoryDeep }, style as StyleProp<ViewStyle>]} />
    );
  return <Image source={{ uri: url }} style={style} contentFit={contentFit} transition={transition} />;
}
