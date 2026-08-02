import { useLocalSearchParams } from 'expo-router';
import { FileQuestion } from 'lucide-react-native';
import React from 'react';

import { WindowEditor } from '@/components/WindowEditor';
import { EmptyState, ScrollScreen } from '@/components/ui';
import { palette } from '@/constants/theme';
import { useStore } from '@/providers/store';

export default function WindowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useStore();
  const win = db.windows.find((w) => w.id === id) ?? null;

  if (!win) {
    return (
      <ScrollScreen>
        <EmptyState
          icon={<FileQuestion size={26} color={palette.olive} />}
          title="الشباك غير موجود"
          body="ربما تم حذفه من المشروع."
        />
      </ScrollScreen>
    );
  }

  return <WindowEditor projectId={win.projectId} roomId={win.roomId} existing={win} />;
}
