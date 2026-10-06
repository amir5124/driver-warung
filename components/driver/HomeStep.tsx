import AppAlert from '@/components/AppAlert';
import { PulsingDot } from '@/components/gosend/PulsingDot';
import { mapStyle } from '@/constants/ojek-map-style';
import { colors, MAP_DELTA } from '@/constants/ojek-theme';
import {
    BANYUWANGI_REGION,
    useUserLocation,
} from '@/hooks/use-user-location';
import { api } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAP_PROVIDER } from '../ojek/parts';
import SettingsModal from './SettingsModal';

const LOCATION_BLUE = '#4285F4';
const LOCATION_PUSH_INTERVAL = 5000;

type Props = {
    isOnline: boolean;
    onToggleOnline: (next: boolean) => void;
};

type ProfileCache = {
    full_name: string | null;
    avatar_url: string | null;
};

type DriverStats = {
    points: number;
    performancePct: number;
    completedToday: number;
    totalToday: number;
    earnings: number;
    rating: number;
    totalTrips: number;
};

const DEFAULT_STATS: DriverStats = {
    points: 0,
    performancePct: 0,
    completedToday: 0,
    totalToday: 0,
    earnings: 0,
    rating: 0,
    totalTrips: 0,
};

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

export default function HomeStep({ isOnline, onToggleOnline }: Props) {
    const insets = useSafeAreaInsets();
    const location = useUserLocation();
    const mapRef = useRef<MapView>(null);
    const [showSettings, setShowSettings] = useState(false);
    const didAutoZoomRef = useRef(false);
    const locationPushRef = useRef<ReturnType<typeof setInterval> | null>(
        null
    );

    // Profil driver
    const [profile, setProfile] = useState<ProfileCache | null>(null);
    const [stats, setStats] = useState<DriverStats>(DEFAULT_STATS);
    const [loadingStats, setLoadingStats] = useState(true);

    // Status verifikasi
    const [isVerified, setIsVerified] = useState<boolean | null>(null);

    // Alert state
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
        buttons?: AlertButton[];
    }>({
        visible: false,
        title: '',
        message: '',
        buttons: undefined,
    });

    const showAlert = (
        title: string,
        message: string,
        buttons?: AlertButton[]
    ) => setAlertState({ visible: true, title, message, buttons });

    const hideAlert = () =>
        setAlertState((a) => ({ ...a, visible: false }));

    // ============================================================
    // Load data — dengan defensive null guards
    // ============================================================
    const loadData = useCallback(async () => {
        try {
            // ── 1. Cache profil dulu ──
            const raw = await AsyncStorage.getItem('profile');
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed) {
                        setProfile({
                            full_name: parsed.full_name ?? null,
                            avatar_url: parsed.avatar_url ?? null,
                        });
                    }
                } catch (e) {
                    console.warn(
                        '[HOME] Gagal parse cache profil:',
                        e
                    );
                }
            }

            // ── 2. Fresh profil — dengan try/catch + null guard ──
            let freshProfile: any = null;
            try {
                freshProfile = await api.me();
            } catch (err: any) {
                console.warn(
                    '[HOME] Gagal fetch api.me():',
                    err?.message
                );
            }

            if (freshProfile?.id) {
                setProfile({
                    full_name: freshProfile.full_name ?? null,
                    avatar_url: freshProfile.avatar_url ?? null,
                });
                try {
                    await AsyncStorage.setItem(
                        'profile',
                        JSON.stringify(freshProfile)
                    );
                } catch (e) {
                    console.warn(
                        '[HOME] Gagal simpan cache profil:',
                        e
                    );
                }
            } else {
                console.warn(
                    '[HOME] api.me() return null — pakai cache'
                );
            }

            // ── 3. Driver profile (rating, trips, verified) ──
            let driverRating = 0;
            let driverTotalTrips = 0;
            try {
                const dp = await api.drivers.getMyProfile();
                if (dp) {
                    driverRating = dp.rating_avg ?? 0;
                    driverTotalTrips = dp.total_trips ?? 0;
                    setIsVerified(dp.is_verified ?? false);
                } else {
                    setIsVerified(false);
                }
            } catch (err: any) {
                console.warn(
                    '[HOME] Gagal load driver profile:',
                    err?.message
                );
                setIsVerified(false);
            }

            // ── 4. Earnings ──
            let completedToday = 0;
            let totalToday = 0;
            let earningsToday = 0;
            try {
                const earnings = await api.drivers.getEarnings();
                earningsToday = earnings?.today ?? 0;

                const history =
                    (await api.drivers.getEarningsHistory(20, 0)) ?? [];

                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);

                const todayOrders = history.filter((h) => {
                    if (!h.completed_at) return false;
                    const d = new Date(h.completed_at);
                    return d >= todayStart;
                });

                completedToday = todayOrders.filter(
                    (h) => h.driver_earning > 0
                ).length;
                totalToday = todayOrders.length;
            } catch (err: any) {
                console.warn(
                    '[HOME] Gagal load earnings:',
                    err?.message
                );
            }

            // ── 5. Performance ──
            const performancePct =
                totalToday > 0
                    ? Math.round((completedToday / totalToday) * 100)
                    : 0;

            const points = completedToday * 100;

            setStats({
                points,
                performancePct,
                completedToday,
                totalToday,
                earnings: earningsToday,
                rating: driverRating ?? 0,
                totalTrips: driverTotalTrips,
            });
        } catch (err: any) {
            console.warn('[HOME] Gagal load data:', err?.message);
        } finally {
            setLoadingStats(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    // ============================================================
    // Lokasi
    // ============================================================
    const coords = location.coords;

    const recenter = () => {
        if (!coords) return;
        mapRef.current?.animateToRegion(
            { ...coords, ...MAP_DELTA },
            500
        );
    };

    useEffect(() => {
        if (coords && location.justGranted && !didAutoZoomRef.current) {
            didAutoZoomRef.current = true;
            mapRef.current?.animateToRegion(
                { ...coords, ...MAP_DELTA },
                800
            );
        }
    }, [coords, location.justGranted]);

    // ============================================================
    // Update lokasi ke backend tiap 5 detik (saat online)
    // ============================================================
    useEffect(() => {
        if (locationPushRef.current) {
            clearInterval(locationPushRef.current);
            locationPushRef.current = null;
        }

        if (!isOnline || !coords) return;

        const push = async () => {
            try {
                await api.drivers.updateLocation(
                    coords.latitude,
                    coords.longitude
                );
            } catch (err: any) {
                if (
                    !String(err?.message).includes('Tidak bisa terhubung')
                ) {
                    console.warn(
                        '[HOME] Gagal update lokasi:',
                        err.message
                    );
                }
            }
        };

        push();

        locationPushRef.current = setInterval(
            push,
            LOCATION_PUSH_INTERVAL
        );

        return () => {
            if (locationPushRef.current) {
                clearInterval(locationPushRef.current);
                locationPushRef.current = null;
            }
        };
    }, [isOnline, coords]);

    // ============================================================
    // FAB handler — dengan guard verifikasi
    // ============================================================
    const handleFabPress = () => {
        if (!isOnline) {
            // Belum verified → tidak bisa online
            if (isVerified === false) {
                showAlert(
                    'Akun Belum Terverifikasi',
                    'Upload dokumen verifikasi dulu (KTP, SIM, STNK) untuk bisa online dan terima orderan.',
                    [
                        { text: 'Nanti', style: 'cancel' },
                        {
                            text: 'Verifikasi Sekarang',
                            onPress: () =>
                                router.push('/verification' as any),
                        },
                    ]
                );
                return;
            }

            onToggleOnline(true);
        } else {
            setShowSettings(true);
        }
    };

    // ============================================================
    // Avatar helpers
    // ============================================================
    const effectiveAvatarUri = profile?.avatar_url ?? null;
    const initials = (profile?.full_name ?? 'D')
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');

    const openProfile = () => {
        router.push('/(tabs)/profile' as any);
    };

    const openVerification = () => {
        router.push('/verification' as any);
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <View style={{ flex: 1 }}>
            <MapView
                ref={mapRef}
                style={{ flex: 1 }}
                provider={MAP_PROVIDER}
                customMapStyle={mapStyle}
                toolbarEnabled={false}
                rotateEnabled={false}
                initialRegion={{
                    ...(coords ?? BANYUWANGI_REGION),
                    ...MAP_DELTA,
                }}
                showsUserLocation={true}
                showsMyLocationButton={false}
            >
                {coords && (
                    <Marker
                        coordinate={coords}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                    >
                        <PulsingDot
                            color={LOCATION_BLUE}
                            icon="navigate"
                            size={20}
                        />
                    </Marker>
                )}
            </MapView>

            {/* ===== TOP ROW: Avatar + FAB ===== */}
            <View style={[s.topRow, { top: insets.top + 12 }]}>
                <Pressable
                    onPress={openProfile}
                    style={({ pressed }) => [
                        s.avatarPressable,
                        pressed && { opacity: 0.7 },
                    ]}
                    hitSlop={8}
                >
                    <View style={s.avatar}>
                        {effectiveAvatarUri ? (
                            <Image
                                source={{ uri: effectiveAvatarUri }}
                                style={s.avatarImg}
                                onError={() => {
                                    setProfile((prev) =>
                                        prev
                                            ? {
                                                ...prev,
                                                avatar_url: null,
                                            }
                                            : prev
                                    );
                                }}
                            />
                        ) : initials ? (
                            <Text style={s.avatarInitials}>
                                {initials}
                            </Text>
                        ) : (
                            <Ionicons
                                name="person"
                                size={20}
                                color="#fff"
                            />
                        )}
                    </View>

                    <View style={s.avatarBadge}>
                        <Ionicons
                            name="chevron-forward"
                            size={10}
                            color="#fff"
                        />
                    </View>
                </Pressable>

                <View style={s.rightGroup}>
                    <View
                        style={[
                            s.fabRing,
                            !isOnline && s.fabRingHidden,
                        ]}
                    >
                        <Pressable
                            onPress={handleFabPress}
                            style={[
                                s.fab,
                                {
                                    backgroundColor: isOnline
                                        ? colors.primary
                                        : '#1c1c1e',
                                },
                            ]}
                        >
                            <Ionicons
                                name={
                                    isOnline
                                        ? 'radio-button-on'
                                        : 'power'
                                }
                                size={isOnline ? 30 : 26}
                                color="#fff"
                            />
                        </Pressable>
                    </View>
                </View>
            </View>

            {/* ============================================================
                BANNER VERIFIKASI — muncul kalau belum verified
            ============================================================ */}
            {isVerified === false && (
                <Pressable
                    style={[s.verifyBanner, { top: insets.top + 76 }]}
                    onPress={openVerification}
                >
                    <View style={s.verifyIconWrap}>
                        <Ionicons
                            name="alert-circle"
                            size={18}
                            color="#fff"
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.verifyBannerTitle}>
                            Akun Belum Terverifikasi
                        </Text>
                        <Text style={s.verifyBannerDesc}>
                            Upload dokumen untuk mulai terima orderan
                        </Text>
                    </View>
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#fff"
                    />
                </Pressable>
            )}

            {/* ===== STATUS PILL ===== */}
            <View
                pointerEvents="box-none"
                style={[
                    s.statusPillWrap,
                    {
                        top:
                            isVerified === false
                                ? insets.top + 140
                                : insets.top + 12,
                    },
                ]}
            >
                {isOnline ? (
                    <View style={s.statsPill}>
                        <View style={s.statsItem}>
                            <Ionicons
                                name="trending-up"
                                size={14}
                                color="#8E44AD"
                            />
                            <Text style={s.statsText}>
                                {stats.performancePct}%
                            </Text>
                        </View>

                        {/* Rating — selalu tampil, 0.0 kalau belum ada */}
                        <View style={s.statsDivider} />
                        <View style={s.statsItem}>
                            <Ionicons name="star" size={14} color="#F5A623" />
                            <Text style={s.statsText}>
                                {Number(stats.rating ?? 0).toFixed(1)}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <Pressable
                        style={s.offlinePill}
                        onPress={handleFabPress}
                    >
                        <Text style={s.offlineText}>Lagi offline</Text>
                        <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.text}
                        />
                    </Pressable>
                )}
            </View>

            {/* ===== RIGHT FABS ===== */}
            <View
                style={[
                    s.rightFabs,
                    { bottom: insets.bottom + 24 },
                ]}
            >
                <Pressable
                    style={[
                        s.smallFab,
                        { backgroundColor: colors.primary },
                    ]}
                    onPress={() =>
                        router.push('/(tabs)/pendapatan' as any)
                    }
                >
                    <Ionicons
                        name="cash-outline"
                        size={20}
                        color="#fff"
                    />
                </Pressable>

                <Pressable style={s.smallFabWhite} onPress={recenter}>
                    <Ionicons
                        name="locate"
                        size={20}
                        color={colors.text}
                    />
                </Pressable>
            </View>

            {/* SettingsModal */}
            <SettingsModal
                visible={showSettings}
                onClose={() => setShowSettings(false)}
                points={stats.points}
                performancePct={stats.performancePct}
                completedToday={stats.completedToday}
                totalToday={stats.totalToday}
                isOnline={isOnline}
                onToggleOnline={onToggleOnline}
            />

            {/* AppAlert */}
            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={alertState.buttons}
                onClose={hideAlert}
            />
        </View>
    );
}

const s = StyleSheet.create({
    topRow: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    avatarPressable: {
        position: 'relative',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarInitials: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
    avatarBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: colors.primary,
        borderWidth: 2,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },

    rightGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },

    // Banner verifikasi
    verifyBanner: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#e68515',
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 12,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    verifyIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    verifyBannerTitle: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 13,
    },
    verifyBannerDesc: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 11,
        marginTop: 2,
    },

    statusPillWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
    },
    offlinePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        borderRadius: 24,
        paddingHorizontal: 18,
        paddingVertical: 13,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    offlineText: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    statsPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    statsItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    statsText: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    statsDivider: {
        width: StyleSheet.hairlineWidth,
        height: 18,
        backgroundColor: colors.border,
        marginHorizontal: 12,
    },

    fabRing: {
        borderRadius: 33,
        padding: 3,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.9)',
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
    fabRingHidden: {
        borderColor: 'transparent',
        elevation: 4,
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    fab: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
    },

    rightFabs: {
        position: 'absolute',
        right: 16,
        gap: 12,
        alignItems: 'center',
    },
    smallFab: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    smallFabWhite: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
});