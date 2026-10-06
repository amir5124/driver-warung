// lib/push.ts (driver)
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

// ============================================================
// 🔔 KONFIGURASI CHANNEL DRIVER
// ============================================================
// ⚠️ HARUS SAMA dengan:
// - DRIVER_CHANNEL_ID & DRIVER_SOUND di app/_layout.tsx
// - defaultChannel & sounds di app.json
// - CHANNEL_MAP.driver & SOUND_MAP.driver di backend (notification.service.ts)
//
// Nama resource Android: huruf kecil, angka, underscore (TANPA tanda hubung).
// File suara: assets/sounds/driver_order.mp3
//   → di build native jadi android/app/src/main/res/raw/driver_order.mp3
// ============================================================
const ANDROID_CHANNEL_ID = 'driver-orders-v4';
const ANDROID_SOUND = 'driver_order.mp3';

// Bandingkan nama suara tanpa ekstensi (Android bisa mengembalikan
// dengan atau tanpa ".mp3")
const stripExt = (name?: string | null) =>
    (name ?? '').replace(/\.[a-z0-9]+$/i, '');

// Handler notif di foreground (biar tetap bunyi walau app terbuka)
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

export async function registerForPushNotifications() {
    // ============================================================
    // 1. Cek device fisik
    // ============================================================
    if (!Device.isDevice) {
        console.warn('[push-driver] Bukan device fisik, skip');
        return null;
    }

    // ============================================================
    // 2. Minta permission notifikasi
    // ============================================================
    const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.warn('[push-driver] Izin notifikasi ditolak');
        return null;
    }

    // ============================================================
    // 3. Android: VERIFIKASI channel (JANGAN buat di sini)
    // ------------------------------------------------------------
    // Channel sudah dibuat di app/_layout.tsx (setupNotifications).
    // Di sini cukup cek apakah channel sudah ada & suaranya benar.
    //
    // ⚠️ JANGAN pakai setNotificationChannelAsync di sini karena:
    // - Bisa bentrok dengan yang di _layout.tsx
    // - Channel pertama yang dibuat yang menang (sound-nya ke-cache)
    // ============================================================
    if (Platform.OS === 'android') {
        try {
            const ch = await Notifications.getNotificationChannelAsync(
                ANDROID_CHANNEL_ID
            );

            if (!ch) {
                console.warn(
                    '[push-driver] ⚠️ Channel belum dibuat! Pastikan _layout.tsx setupNotifications() sudah jalan.'
                );
            } else {
                console.log(
                    '[push-driver] ✅ Channel OK:',
                    ANDROID_CHANNEL_ID,
                    '| sound:',
                    ch.sound,
                    '| importance:',
                    ch.importance
                );

                if (!ch.sound || ch.sound === 'default') {
                    console.warn(
                        '[push-driver] ⚠️ Channel masih suara default. Cek file di res/raw atau naikkan ID channel.'
                    );
                }
            }
        } catch (err: any) {
            console.warn('[push-driver] Cek channel gagal:', err.message);
        }
    }

    // ============================================================
    // 4. Ambil EAS projectId dari app.json
    // ============================================================
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
        console.warn(
            '[push-driver] projectId kosong di app.json. Jalankan `eas init` dulu.'
        );
        return null;
    }

    // ============================================================
    // 5. Ambil Expo Push Token
    // ============================================================
    let token: string | null = null;
    try {
        const result = await Notifications.getExpoPushTokenAsync({
            projectId,
        });
        token = result.data;
        console.log('[push-driver] Expo Push Token:', token);
    } catch (err: any) {
        console.error('[push-driver] Gagal ambil token:', err.message);
        return null;
    }

    if (!token) {
        console.warn('[push-driver] Token kosong');
        return null;
    }

    // ============================================================
    // 6. Simpan token ke backend (profiles.fcm_token)
    // ============================================================
    try {
        await api.updateProfile({ fcm_token: token });
        console.log('[push-driver] Token tersimpan di backend');
    } catch (err: any) {
        console.warn('[push-driver] Gagal simpan token:', err.message);
    }

    return token;
}