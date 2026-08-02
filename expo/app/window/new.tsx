import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { WindowEditor } from '@/components/WindowEditor';

export default function NewWindowScreen() {
  const { projectId, roomId } = useLocalSearchParams<{ projectId: string; roomId: string }>();
  return <WindowEditor projectId={projectId} roomId={roomId} existing={null} />;
}
