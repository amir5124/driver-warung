import Avatar from '@/components/Avatar';
import { colors } from '@/constants/ojek-theme';
import { useUserLocation } from '@/hooks/use-user-location';
import { api, OrderResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import type { DriverOrder } from '@/types/driver';
import type { Coords } from '@/types/ojek';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import SwipeButton from './SwipeButton';
import TripMapShell from './TripMapShell';

type Phase = 'toPickup' | 'atPickup' | 'toDropoff';

type Props = {
    order: DriverOrder;
    onComplete: () => void;
    /** 🆕 Dipanggil saat order di-cancel / error 409 */
    onCancelExit: (title: string, message: string) => void;
    onChat?: () => void;
};

const VEHICLE_ICON_COLOR = '#1AA260';
const EMERGENCY_NUMBER = '62812285777';

function isNear(a: Coords, b: Coords, maxDeg = 0.05) {
    return (
        Math.abs(a.latitude - b.latitude) < maxDeg &&
        Math.abs(a.longitude - b.longitude) < maxDeg
    );
}

export default function RideTripStep({
    order,
    onComplete,
    onCancelExit,
    onChat,
}: Props) {
    const [phase, setPhase] = useState<Phase>('toPickup');
    const [currentOrder, setCurrentOrder] = useState<OrderResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [unread, setUnread] = useState(0);

    // Simpan customer info lengkap dengan rating & reviews
    const [customerInfo, setCustomerInfo] = useState<{
        name: string;
        avatarUrl: string | null;
        phone: string | null;
        rating: number | null;
        reviews: number;
    }>({
        name: order.customerName,
        avatarUrl: null,
        phone: null,
        rating: order.customerRating ?? null,
        reviews: order.customerReviews ?? 0,
    });

    const location = useUserLocation();

    // ============================================================
    // Load detail order dari API saat mount
    // ============================================================
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const fresh = await api.orders.get(Number(order.id));
                if (!alive) return;
                setCurrentOrder(fresh);

                console.log(
                    '[RIDE-TRIP] fresh.customer FULL:',
                    JSON.stringify(fresh.customer, null, 2)
                );

                if (fresh.customer) {
                    const ratingAvg =
                        (fresh.customer as any).rating_avg ?? null;

                    const reviewCount =
                        (fresh.customer as any).total_reviews ??
                        (fresh.customer as any).stats?.review_count ??
                        0;

                    console.log('[RIDE-TRIP] Parsed customer:', {
                        name: fresh.customer.full_name,
                        ratingAvg,
                        reviewCount,
                    });

                    setCustomerInfo({
                        name:
                            fresh.customer.full_name ??
                            order.customerName ??
                            'Customer',
                        avatarUrl: fresh.customer.avatar_url ?? null,
                        phone: (fresh.customer as any).phone ?? null,
                        rating: ratingAvg,
                        reviews: reviewCount,
                    });
                }

                if (fresh.status === 'accepted') setPhase('toPickup');
                else if (fresh.status === 'arrived') setPhase('atPickup');
                else if (fresh.status === 'in_progress') setPhase('toDropoff');
            } catch (err: any) {
                console.warn('[RIDE-TRIP] Gagal load order:', err?.message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [order.id, order.customerName]);

    // ============================================================
    // 🆕 POLLING STATUS — deteksi cancel
    // ============================================================
    useEffect(() => {
        if (!order.id) return;

        let alive = true;
        let cancelled = false;

        const checkStatus = async () => {
            if (cancelled) return;
            try {
                const fresh = await api.orders.get(Number(order.id));
                if (!alive) return;

                if (fresh.status === 'cancelled') {
                    cancelled = true;
                    console.log(
                        '[RIDE-TRIP] Order cancelled detected:',
                        order.id
                    );

                    onCancelExit(
                        'Orderan Dibatalkan',
                        fresh.cancellation_reason
                            ? `Alasan: ${fresh.cancellation_reason}`
                            : `Orderan dibatalkan oleh ${fresh.customer?.full_name ??
                            order.customerName ??
                            'Customer'
                            }`
                    );
                }
            } catch {
                // Silent — jangan ganggu UI
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);

        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, [order.id, order.customerName, onCancelExit]);

    // ============================================================
    // Badge pesan belum dibaca
    // ============================================================
    const fetchUnread = useCallback(async () => {
        try {
            const res = await api.chat.unreadByOrder(Number(order.id));
            setUnread(res.unread);
        } catch (err: any) {
            console.warn('[RIDE-TRIP] gagal ambil unread:', err?.message);
        }
    }, [order.id]);

    useFocusEffect(
        useCallback(() => {
            fetchUnread();
        }, [fetchUnread])
    );

    useEffect(() => {
        const channel = supabase
            .channel(`order-chat:${order.id}`)
            .on('broadcast', { event: 'new_message' }, () => fetchUnread())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [order.id, fetchUnread]);

    // ============================================================
    // Telepon customer & tombol darurat
    // ============================================================
    const handleCall = () => {
        if (!customerInfo.phone) {
            Alert.alert(
                'Nomor tidak tersedia',
                'Customer belum punya nomor telepon.'
            );
            return;
        }
        Linking.openURL(`tel:${customerInfo.phone}`).catch(() => {
            Alert.alert('Gagal', 'Tidak bisa membuka aplikasi telepon.');
        });
    };

    const handleEmergency = () => {
        const text = encodeURIComponent(
            `DARURAT! Saya driver ${customerInfo.name ? 'dengan penumpang ' + customerInfo.name : ''
            } (order #${order.id}). Mohon bantuan.`
        );
        Linking.openURL(`https://wa.me/${EMERGENCY_NUMBER}?text=${text}`).catch(
            () => {
                Linking.openURL(`tel:+${EMERGENCY_NUMBER}`).catch(() => {
                    Alert.alert(
                        'Gagal',
                        'Tidak bisa menghubungi nomor darurat.'
                    );
                });
            }
        );
    };

    // ============================================================
    // 🆕 Helper: deteksi error karena order tidak aktif
    // ============================================================
    const isOrderInactiveError = (msg: string): boolean => {
        return (
            msg.includes('dibatalkan') ||
            msg.includes('sudah selesai') ||
            msg.includes('Tidak bisa ubah status')
        );
    };

    // ============================================================
    // Update status ke backend
    // ============================================================
    const handlePhaseChange = useCallback(
        async (nextPhase: Phase, backendStatus: 'arrived' | 'in_progress') => {
            if (loading) return;
            setLoading(true);

            try {
                const updated = await api.orders.updateStatus(
                    Number(order.id),
                    backendStatus
                );

                setCurrentOrder((prev) => ({
                    ...(prev ?? {}),
                    ...updated,
                    customer: updated.customer ?? prev?.customer ?? null,
                }));

                setPhase(nextPhase);
            } catch (err: any) {
                const msg = err?.message ?? '';
                console.warn('[RIDE-TRIP] Gagal update status:', msg);

                // 🆕 Deteksi order sudah cancel / completed
                if (isOrderInactiveError(msg)) {
                    onCancelExit('Orderan Tidak Aktif', msg);
                    return;
                }

                Alert.alert('Gagal update status', msg || 'Coba lagi sebentar.');
            } finally {
                setLoading(false);
            }
        },
        [order.id, loading, onCancelExit]
    );

    const handleComplete = useCallback(async () => {
        if (loading) return;
        setLoading(true);

        try {
            const updated = await api.orders.updateStatus(
                Number(order.id),
                'completed'
            );
            setCurrentOrder((prev) => ({
                ...(prev ?? {}),
                ...updated,
                customer: updated.customer ?? prev?.customer ?? null,
            }));
            onComplete();
        } catch (err: any) {
            const msg = err?.message ?? '';
            console.warn('[RIDE-TRIP] Gagal complete:', msg);

            // 🆕 Deteksi order sudah cancel / completed
            if (isOrderInactiveError(msg)) {
                onCancelExit('Orderan Tidak Aktif', msg);
                return;
            }

            Alert.alert('Gagal selesaikan order', msg || 'Coba lagi sebentar.');
        } finally {
            setLoading(false);
        }
    }, [order.id, loading, onComplete, onCancelExit]);

    // ============================================================
    // Data display
    // ============================================================
    const displayOrder = currentOrder;

    const customerName = customerInfo.name;
    const customerAvatarUrl = customerInfo.avatarUrl;
    const customerRating = customerInfo.rating;
    const customerReviews = customerInfo.reviews;

    const pickupName = displayOrder?.pickup_name ?? order.pickup.name;
    const pickupAddress = displayOrder?.pickup_address ?? order.pickup.address;
    const pickupCoords = displayOrder?.pickup_coords ?? order.pickup.coords;

    const dropoffName = displayOrder?.dropoff_name ?? order.dropoff.name;
    const dropoffAddress =
        displayOrder?.dropoff_address ?? order.dropoff.address;
    const dropoffCoords = displayOrder?.dropoff_coords ?? order.dropoff.coords;

    // ============================================================
    // Koordinat driver
    // ============================================================
    const gpsCoords = location.coords;
    const fallbackDriverCoords: Coords = {
        latitude: pickupCoords.latitude - 0.006,
        longitude: pickupCoords.longitude - 0.004,
    };
    const driverCoords =
        gpsCoords && isNear(gpsCoords, pickupCoords)
            ? gpsCoords
            : fallbackDriverCoords;

    const target =
        phase === 'toDropoff'
            ? {
                name: dropoffName,
                address: dropoffAddress,
                coords: dropoffCoords,
            }
            : {
                name: pickupName,
                address: pickupAddress,
                coords: pickupCoords,
            };

    const targetColor =
        phase === 'toDropoff' ? colors.secondary : colors.primary;
    const targetMarkerType = phase === 'toDropoff' ? 'pin' : 'account';

    const showRating = customerRating != null && customerReviews > 0;

    return (
        <TripMapShell
            driverCoords={driverCoords}
            targetCoords={target.coords}
            targetColor={targetColor}
            targetMarkerType={targetMarkerType}
            showEmergency
            emergencyLabel="DARURAT"
            onEmergency={handleEmergency}
            sheetHeight={phase === 'toDropoff' ? 260 : 300}
        >
            <View style={s.customerRow}>
                <Avatar
                    uri={customerAvatarUrl}
                    name={customerName}
                    size={42}
                    backgroundColor={VEHICLE_ICON_COLOR}
                />

                <View style={{ flex: 1 }}>
                    <Text style={s.customerLabel}>Dipesan oleh</Text>
                    <Text style={s.customerName} numberOfLines={1}>
                        {customerName}
                    </Text>

                    {showRating ? (
                        <View style={s.ratingRow}>
                            <Ionicons
                                name="star"
                                size={12}
                                color="#F5A623"
                            />
                            <Text style={s.customerRating}>
                                {Number(customerRating).toFixed(1)} •{' '}
                                {customerReviews} ulasan
                            </Text>
                        </View>
                    ) : (
                        <Text style={s.customerRating}>
                            Customer baru
                        </Text>
                    )}
                </View>

                <View style={s.actions}>
                    <Pressable
                        style={[
                            s.actionBtn,
                            !customerInfo.phone && { opacity: 0.4 },
                        ]}
                        onPress={handleCall}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="call-outline"
                            size={20}
                            color={colors.text}
                        />
                    </Pressable>

                    <Pressable
                        style={s.actionBtn}
                        onPress={onChat}
                        disabled={!onChat}
                        hitSlop={8}
                    >
                        <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={20}
                            color={colors.text}
                        />
                        {unread > 0 && (
                            <View style={s.badge}>
                                <Text style={s.badgeText}>
                                    {unread > 99 ? '99+' : unread}
                                </Text>
                            </View>
                        )}
                    </Pressable>
                </View>
            </View>

            <View style={s.divider} />

            <View style={s.stopRow}>
                <View style={[s.stopIcon, { backgroundColor: targetColor }]}>
                    <Ionicons name="person" size={14} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.stopName} numberOfLines={1}>
                        {target.name}
                    </Text>
                    <Text style={s.stopAddr} numberOfLines={2}>
                        {target.address}
                    </Text>
                </View>
            </View>

            {phase === 'toPickup' && (
                <SwipeButton
                    label={loading ? 'Memproses…' : 'Tiba di titik jemput'}
                    color={colors.primary}
                    onConfirm={() => handlePhaseChange('atPickup', 'arrived')}
                />
            )}
            {phase === 'atPickup' && (
                <SwipeButton
                    label={loading ? 'Memproses…' : 'Udah sama customer'}
                    color={colors.primary}
                    onConfirm={() =>
                        handlePhaseChange('toDropoff', 'in_progress')
                    }
                />
            )}
            {phase === 'toDropoff' && (
                <SwipeButton
                    label={loading ? 'Menyelesaikan…' : 'Selesai antar'}
                    color="#1AA260"
                    onConfirm={handleComplete}
                />
            )}

            {loading && (
                <View style={s.loadingOverlay} pointerEvents="none">
                    <ActivityIndicator size="small" color={colors.primary} />
                </View>
            )}
        </TripMapShell>
    );
}

const s = StyleSheet.create({
    customerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
    },
    customerLabel: { fontSize: 12, color: colors.textMuted },
    customerName: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
        marginTop: 2,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    customerRating: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: -2,
        right: -2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
        backgroundColor: '#E53935',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: 12,
    },
    stopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 18,
    },
    stopIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginTop: 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 3,
    },
    stopName: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
    },
    stopAddr: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 3,
        lineHeight: 18,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 12,
        right: 12,
    },
});