// app/_layout.tsx
import { setUnauthorizedHandler } from '@/lib/api';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Stack, router, useRootNavigationState } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { activeOrderStore } from '@/lib/activeOrderStore';
import { api, getToken, type OrderResponse } from '@/lib/api';
import { incomingOrderStore } from '@/lib/incomingOrderStore';
import { toDriverOrder } from '@/lib/order-utils';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

SplashScreen.preventAutoHideAsync();

// ============================================================
// 🔔 NOTIFIKASI: channel khusus DRIVER
// ============================================================
// ⚠️ HARUS SAMA dengan:
// - ANDROID_CHANNEL_ID & ANDROID_SOUND di lib/push.ts
// - defaultChannel & sounds di app.json
// - CHANNEL_MAP.driver & SOUND_MAP.driver di backend
//
// Suara channel Android DIKUNCI saat channel pertama dibuat, dan kalau
// channel yang sama dihapus lalu dibuat ulang, Android memulihkan
// pengaturan lamanya. Jadi kalau suara salah, GANTI ID channel (v5, dst),
// jangan hanya hapus-buat ulang.
// ============================================================
export const DRIVER_CHANNEL_ID = 'driver-orders-v4';

const OLD_CHANNEL_IDS = [
  'orders',
  'driver-orders',
  'driver-orders-v1',
  'driver-orders-v2',
  'driver-orders-v3',
];

const DRIVER_SOUND = 'driver_order.mp3';

const stripExt = (name?: string | null) =>
  (name ?? '').replace(/\.[a-z0-9]+$/i, '');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Buat channel Android. Cepat & tidak memunculkan dialog izin. */
async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;

  try {
    for (const id of OLD_CHANNEL_IDS) {
      try {
        await Notifications.deleteNotificationChannelAsync(id);
      } catch { }
    }

    await Notifications.setNotificationChannelAsync(DRIVER_CHANNEL_ID, {
      name: 'Order Masuk',
      description: 'Notifikasi untuk order dan transaksi driver',
      importance: Notifications.AndroidImportance.MAX,
      sound: DRIVER_SOUND,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });

    // Verifikasi: suara yang benar-benar terpasang di channel
    const ch = await Notifications.getNotificationChannelAsync(DRIVER_CHANNEL_ID);
    console.log(
      '[DRIVER-LAYOUT] ✅ Channel siap:',
      DRIVER_CHANNEL_ID,
      '| sound:',
      ch?.sound
    );

    if (stripExt(ch?.sound) !== stripExt(DRIVER_SOUND)) {
      console.warn(
        '[DRIVER-LAYOUT] ⚠️ Suara channel tidak sesuai. Diharapkan:',
        DRIVER_SOUND,
        '| Aktual:',
        ch?.sound,
        '→ cek file di android/app/src/main/res/raw/ lalu GANTI ID channel (mis. v5).'
      );
    }
  } catch (err) {
    console.warn('[DRIVER-LAYOUT] Setup channel gagal:', err);
  }
}

/** Minta izin notifikasi. Dipanggil SETELAH navigasi awal (tidak menahan splash). */
async function requestNotificationPermission() {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      await Notifications.requestPermissionsAsync();
    }
  } catch (err) {
    console.warn('[DRIVER-LAYOUT] Minta izin notifikasi gagal:', err);
  }
}

// ============================================================
// HELPER: Deteksi tipe notifikasi
// ============================================================
const CHAT_TYPES = ['chat', 'chat_message', 'message'];
const NEW_ORDER_TYPE = 'new_order';
const AUTOBID_TYPE = 'autobid_accepted';
const WALLET_TYPES = [
  'topup_created',
  'topup_success',
  'topup_failed',
  'withdraw_success',
  'withdraw_failed',
];

const typeOf = (data: any) => String(data?.type ?? '').toLowerCase();

const isChatNotification = (data: any) => !!data && CHAT_TYPES.includes(typeOf(data));
const isNewOrderNotification = (data: any) => !!data && typeOf(data) === NEW_ORDER_TYPE;
const isAutobidNotification = (data: any) => !!data && typeOf(data) === AUTOBID_TYPE;
const isWalletNotification = (data: any) => !!data && WALLET_TYPES.includes(typeOf(data));

// ============================================================
// HELPER: cegah notif yang sama diproses dua kali
// (listener foreground + listener tap + cold start bisa menembak
//  untuk notifikasi yang sama)
// ============================================================
const recentKeys = new Map<string, number>();

function seenRecently(key: string, windowMs = 15000): boolean {
  const now = Date.now();
  for (const [k, t] of recentKeys) {
    if (now - t > windowMs) recentKeys.delete(k);
  }
  if (recentKeys.has(key)) return true;
  recentKeys.set(key, now);
  return false;
}

// ============================================================
// HELPER: Arahkan ke halaman sesuai tipe notifikasi
// ============================================================
function navigateByNotification(data: any) {
  if (!data) return;

  // ── 1. CHAT ──
  if (isChatNotification(data)) {
    const roomId = Number(data.room_id);
    if (!roomId || Number.isNaN(roomId)) {
      console.warn('[DRIVER-LAYOUT] Notif chat tanpa room_id valid:', data);
      return;
    }

    const peerName = String(data.peer_name ?? data.sender_name ?? 'Chat');
    const url = `/chat/${roomId}?peerName=${encodeURIComponent(peerName)}`;

    console.log('[DRIVER-LAYOUT] → Buka chat:', url);
    router.push(url as any);
    return;
  }

  // ── 2. WALLET ──
  if (isWalletNotification(data)) {
    console.log('[DRIVER-LAYOUT] → Buka pendapatan (notif wallet)');
    router.navigate('/(tabs)/pendapatan' as any);
    return;
  }

  // ── 3. ORDER ──
  const orderId = Number(data.order_id);
  if (orderId) {
    console.log('[DRIVER-LAYOUT] → Buka tabs (untuk order):', orderId);
    router.navigate('/(tabs)' as any);   // navigate (bukan push) → tidak menumpuk tabs
  }
}

// ============================================================
// HANDLER: autobid_accepted
// — fetch order, set ke activeOrderStore, TANPA modal
// ============================================================
async function handleAutobidOrder(data: any) {
  const orderId = Number(data?.order_id);
  if (!orderId) {
    console.warn('[DRIVER-LAYOUT] Autobid tanpa order_id');
    return;
  }

  console.log('[DRIVER-LAYOUT] 🚀 Autobid order:', orderId);

  try {
    const order = await api.orders.get(orderId);

    if (order.status === 'cancelled' || order.status === 'completed') {
      console.log('[DRIVER-LAYOUT] Skip autobid order tidak aktif:', order.status);
      return;
    }

    await activeOrderStore.set(toDriverOrder(order));
    console.log('[DRIVER-LAYOUT] ✅ Autobid → active order set');
  } catch (err: any) {
    console.warn('[DRIVER-LAYOUT] Gagal set autobid order:', err?.message);
  }
}

// ============================================================
// HANDLER: new_order / autobid → store
// ============================================================
async function pushOrderToStore(data: any) {
  if (isChatNotification(data)) return;

  if (isWalletNotification(data)) {
    console.log('[DRIVER-LAYOUT] Skip notif wallet:', data?.type);
    return;
  }

  // Autobid DULU — sebelum new_order
  if (isAutobidNotification(data)) {
    if (seenRecently(`autobid:${data?.order_id}`)) {
      console.log('[DRIVER-LAYOUT] Skip autobid duplikat:', data?.order_id);
      return;
    }
    await handleAutobidOrder(data);
    return;
  }

  if (!isNewOrderNotification(data)) {
    console.log('[DRIVER-LAYOUT] Skip notif non-new_order:', data?.type ?? '(no type)');
    return;
  }

  const orderId = Number(data?.order_id);
  if (!orderId) {
    console.warn('[DRIVER-LAYOUT] Notif new_order tanpa order_id');
    return;
  }

  if (seenRecently(`new_order:${orderId}`)) {
    console.log('[DRIVER-LAYOUT] Skip new_order duplikat:', orderId);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITAS 1: payload notif (order pending belum punya driver_id,
  // jadi GET /api/orders/:id akan 403)
  // ═══════════════════════════════════════════════════════════
  if (data?.order) {
    try {
      const parsed =
        typeof data.order === 'string' ? JSON.parse(data.order) : data.order;

      if (parsed.status === 'cancelled' || parsed.status === 'completed') {
        console.log(
          '[DRIVER-LAYOUT] Skip order tidak aktif dari payload:',
          parsed.id,
          parsed.status
        );
        return;
      }

      console.log(
        '[DRIVER-LAYOUT] ✅ Pakai payload notif:',
        parsed.id,
        'items:',
        parsed.items?.length ?? 0
      );

      const normalized: OrderResponse = {
        ...parsed,
        id: Number(parsed.id),
        distance_km: Number(parsed.distance_km ?? 0),
        duration_min: Number(parsed.duration_min ?? 0),
        delivery_fee: Number(parsed.delivery_fee ?? 0),
        driver_earning: Number(parsed.driver_earning ?? 0),
        total_fare: Number(parsed.total_fare ?? 0),
        subtotal: Number(parsed.subtotal ?? 0),
        packaging_fee: Number(parsed.packaging_fee ?? 0),
        admin_fee: Number(parsed.admin_fee ?? 0),
        platform_earning: Number(parsed.platform_earning ?? 0),
        merchant_earning: Number(parsed.merchant_earning ?? 0),
        customer: parsed.customer_name
          ? {
            id: '',
            full_name: parsed.customer_name,
            phone: null,
            avatar_url: parsed.customer_avatar ?? null,
          }
          : parsed.customer ?? null,
      };

      incomingOrderStore.set(normalized);
      return;
    } catch (err) {
      console.warn('[DRIVER-LAYOUT] Parse payload gagal:', err);
      // lanjut ke fallback API
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITAS 2: fallback fetch dari API
  // ═══════════════════════════════════════════════════════════
  try {
    console.log('[DRIVER-LAYOUT] Fetch detail order dari API:', orderId);

    const order = await api.orders.get(orderId);

    if (order.status === 'cancelled' || order.status === 'completed') {
      console.log(
        '[DRIVER-LAYOUT] Skip order tidak aktif dari API:',
        order.id,
        order.status
      );
      return;
    }

    console.log('[DRIVER-LAYOUT] ✅ Order fetched dari API:', {
      id: order.id,
      type: order.type,
      items: order.items?.length ?? 0,
      subtotal: order.subtotal,
    });

    incomingOrderStore.set(order);
  } catch (err: any) {
    console.warn('[DRIVER-LAYOUT] Gagal fetch order dari API:', err?.message);
  }
}

// ============================================================
// PROSES SATU NOTIFIKASI (satu pintu untuk foreground / tap / cold start)
// ============================================================
type NotifSource = 'foreground' | 'tap' | 'cold';

async function processNotification(data: any, source: NotifSource) {
  // Cek login SAAT INI (bukan snapshot lama), supaya tetap benar
  // setelah user login/logout tanpa restart app
  const token = await getToken();
  if (!token) {
    console.log('[DRIVER-LAYOUT] Skip notif: belum login');
    return;
  }

  if (source === 'foreground') {
    if (isChatNotification(data)) {
      console.log('[DRIVER-LAYOUT] Notif chat di foreground — skip auto-navigate');
      return;
    }
    await pushOrderToStore(data);
    return;
  }

  // tap / cold start
  if (isChatNotification(data) || isWalletNotification(data)) {
    navigateByNotification(data);
    return;
  }

  // Cold start: app sudah mendarat di tabs, tidak perlu navigate lagi
  if (source === 'tap') navigateByNotification(data);
  await pushOrderToStore(data);
}

// ============================================================
// ROOT LAYOUT
// ============================================================
export default function RootLayout() {
  const navState = useRootNavigationState();
  const navReady = !!navState?.key;

  // Hasil cek login saat startup. 'loading' → splash tetap tampil.
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading');

  const bootedRef = useRef(false);        // redirect awal sudah dijalankan
  const appReadyRef = useRef(false);      // navigasi awal selesai
  const logoutLockRef = useRef(false);    // cegah banyak 401 → banyak redirect
  const pendingRef = useRef<{ data: any; source: NotifSource } | null>(null);
  const handledIdsRef = useRef<Set<string>>(new Set());

  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // ----------------------------------------------------------
  // A. Bootstrap: 401 handler + channel + hydrate + cek token.
  //    TIDAK melakukan navigasi di sini.
  // ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    setUnauthorizedHandler(() => {
      // Banyak request paralel bisa 401 bersamaan → redirect sekali saja
      if (logoutLockRef.current) return;
      logoutLockRef.current = true;
      setTimeout(() => {
        logoutLockRef.current = false;
      }, 2000);

      pendingRef.current = null;

      if (!appReadyRef.current) {
        // Navigasi awal belum jalan → biarkan efek B yang mengarahkan ke login
        setAuth('out');
        return;
      }

      console.log('[DRIVER-LAYOUT] 401 → redirect login');
      router.replace('/(auth)/login' as any);
    });

    (async () => {
      try {
        await setupNotificationChannel();
        await activeOrderStore.hydrate();

        const token = await getToken();
        console.log('[DRIVER-LAYOUT] Token tersimpan?', !!token);

        if (!cancelled) setAuth(token ? 'in' : 'out');
      } catch (err) {
        console.warn('[DRIVER-LAYOUT] Prepare gagal:', err);
        if (!cancelled) setAuth('out');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ----------------------------------------------------------
  // B. Redirect awal — SATU kali, hanya setelah navigator siap
  //    dan status login sudah diketahui.
  // ----------------------------------------------------------
  useEffect(() => {
    if (!navReady || auth === 'loading' || bootedRef.current) return;
    bootedRef.current = true;

    router.replace(auth === 'in' ? '/(tabs)' : ('/(auth)/login' as any));
    appReadyRef.current = true;
    SplashScreen.hideAsync().catch(() => { });

    // Setelah navigasi awal terpasang: proses notif yang tertahan,
    // lalu minta izin (tidak menahan splash).
    setTimeout(async () => {
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        console.log('[DRIVER-LAYOUT] Proses notif tertahan:', pending.source);
        await processNotification(pending.data, pending.source);
      }

      await requestNotificationPermission();

      if (auth === 'in') {
        try {
          await Location.requestForegroundPermissionsAsync();
        } catch (err) {
          console.warn('Gagal minta izin lokasi:', err);
        }
      }
    }, 200);
  }, [navReady, auth]);

  // ----------------------------------------------------------
  // C. Listener notifikasi — dipasang sekali.
  //    Sebelum app siap, notif tap / cold start DITAHAN, bukan
  //    langsung navigasi (kalau tidak, ditimpa redirect awal).
  // ----------------------------------------------------------
  useEffect(() => {
    const dispatch = (data: any, source: NotifSource) => {
      if (!appReadyRef.current) {
        // tap/cold selalu menang atas notif foreground yang tertahan
        if (source !== 'foreground' || !pendingRef.current) {
          pendingRef.current = { data, source };
        }
        return;
      }
      processNotification(data, source);
    };

    const markHandled = (id: string | undefined) => {
      if (!id) return true;
      if (handledIdsRef.current.has(id)) return false;
      handledIdsRef.current.add(id);
      return true;
    };

    // 1️⃣ Notif masuk saat app foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        console.log('[DRIVER-LAYOUT] Notif masuk (foreground):', data);
        dispatch(data, 'foreground');
      }
    );

    // 2️⃣ Notif diklik (background → foreground)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (!markHandled(response.notification.request.identifier)) return;
        const data = response.notification.request.content.data;
        console.log('[DRIVER-LAYOUT] Notif diklik:', data);
        dispatch(data, 'tap');
      }
    );

    // 3️⃣ Cold start (app killed → user klik notif)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      if (!markHandled(response.notification.request.identifier)) return;
      const data = response.notification.request.content.data;
      console.log('[DRIVER-LAYOUT] Cold start dari notif:', data);
      dispatch(data, 'cold');
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="topup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="tarik" options={{ presentation: 'modal' }} />
          <Stack.Screen name="chat/[roomId]" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}