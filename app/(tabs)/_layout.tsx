// app/(tabs)/_layout.tsx
import { activeOrderStore } from '@/lib/activeOrderStore';
import type { DriverOrder } from '@/types/driver';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ACTIVE = '#40a3ea';
const INACTIVE = '#9E9E9E';

function TabIcon({
  focused,
  name,
}: {
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
}) {
  return <Ionicons name={name} size={24} color={focused ? ACTIVE : INACTIVE} />;
}

function MessageIcon({
  focused,
  badgeCount,
}: {
  focused: boolean;
  badgeCount?: number;
}) {
  return (
    <View>
      <Ionicons
        name="mail"
        size={24}
        color={focused ? ACTIVE : INACTIVE}
      />
      {!!badgeCount && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badgeCount}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Icon khusus untuk tab "Order" — kalau ada order aktif,
 * tampilkan titik indikator di pojok icon.
 */
function OrderIcon({ focused }: { focused: boolean }) {
  const [hasOrder, setHasOrder] = useState(false);

  useEffect(() => {
    const unsub = activeOrderStore.subscribe((o: DriverOrder | null) => {
      setHasOrder(!!o);
    });
    return () => unsub();
  }, []);

  return (
    <View>
      <MaterialCommunityIcons
        name="invoice-list-outline"
        size={24}
        color={focused ? ACTIVE : INACTIVE}
      />
      {hasOrder && <View style={s.liveDot} />}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: [
          s.tabBar,
          {
            height: 56 + insets.bottom,
            paddingBottom: insets.bottom + 6,
          },
        ],
        tabBarLabelStyle: s.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="home" />
          ),
        }}
      />
      <Tabs.Screen
        name="pendapatan"
        options={{
          title: 'Pendapatan',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name="wallet" />
          ),
        }}
      />
      <Tabs.Screen
        name="order"
        options={{
          title: 'Order',
          tabBarIcon: ({ focused }) => <OrderIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pesan"
        options={{
          title: 'Pesan',
          tabBarIcon: ({ focused }) => (
            <MessageIcon focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name={focused ? 'person' : 'person-outline'}
            />
          ),
        }}
      />


    </Tabs>
  );
}

const s = StyleSheet.create({
  tabBar: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EDEEF0',
    backgroundColor: '#fff',
  },
  tabLabel: { fontSize: 11, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#E8433D',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  liveDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACTIVE,
    borderWidth: 2,
    borderColor: '#fff',
  },
});