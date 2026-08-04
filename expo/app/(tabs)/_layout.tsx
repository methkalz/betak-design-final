import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import {
  CalendarCheck,
  Home,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Scissors,
  Users,
} from 'lucide-react-native';
import React from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { font, palette } from '@/constants/theme';
import { useStore } from '@/providers/store';

export default function TabsLayout() {
  const { role, source } = useStore();
  const insets = useSafeAreaInsets();
  const isAdmin = role === 'admin' || role === 'sales';
  const isField = role === 'field';
  const isTailor = role === 'tailor';

  return (
    <View style={{ flex: 1 }}>
      {source === 'live' && (
        <View
          style={{
            paddingTop: insets.top,
            backgroundColor: palette.oliveDeepest,
            alignItems: 'center',
          }}
        >
          <AppText variant="caption" color={palette.sage} style={{ paddingVertical: 4 }}>
            العرض الحي - بياناتك من الخادم مباشرة، والتعديل من التطبيق يصلك في تحديث قريب
          </AppText>
        </View>
      )}
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.olive,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12, marginTop: 2 },
        // شريط زجاجي عائم: خلفية blur حقيقية على iOS وشفافية بيضاء على أندرويد
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.92)',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 86 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          shadowColor: '#3F3D8F',
          shadowOpacity: 0.10,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: -6 },
          elevation: 14,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={44} tint="light" style={{ flex: 1 }} />
          ) : null,
        tabBarItemStyle: { minHeight: 48 },
        sceneStyle: { backgroundColor: palette.ivory },
      }}
    >
      {/* عربي RTL: أول تصريح يُرسم أقصى اليسار - لذا الترتيب معكوس عمدًا
          كي تكون «الرئيسية» أقصى اليمين و«المزيد» أقصى اليسار */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'المزيد',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><MoreHorizontal size={22} color={color} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'المخزون',
          href: isAdmin ? '/inventory' : null,
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Layers size={22} color={color} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'الزبائن',
          href: isAdmin ? '/customers' : null,
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Users size={22} color={color} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'أوامر الإنتاج',
          href: isTailor ? '/tasks' : null,
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Scissors size={22} color={color} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: 'زياراتي',
          href: isField ? '/visits' : null,
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><CalendarCheck size={22} color={color} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'المشاريع',
          href: isTailor ? null : '/projects',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><LayoutGrid size={22} color={color} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, focused }) => <TabIcon focused={focused}><Home size={22} color={color} /></TabIcon>,
        }}
      />
    </Tabs>
    </View>
  );
}

function TabIcon({ children, focused }: { children: React.ReactNode; focused: boolean }) {
  return (
    <View
      style={{
        width: 46,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? palette.sageSoft : 'transparent',
      }}
    >
      {children}
    </View>
  );
}
