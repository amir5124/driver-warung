// components/driver/FoodTripStep.tsx
import Avatar from '@/components/Avatar';
import { colors } from '@/constants/ojek-theme';
import { useUserLocation } from '@/hooks/use-user-location';
import { api, OrderResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import type { DriverOrder } from '@/types/driver';
import type { Coords } from '@/types/ojek';
import { normalizePhone } from '@/utils/phone';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SwipeButton from './SwipeButton';
import TripMapShell from './TripMapShell';

type Phase =
    | 'toResto'
    | 'atResto'
    | 'orderDetail'
    | 'priceConfirm'
    | 'preparing'
    | 'toCustomer';

type Props = {
    order: DriverOrder;
    onComplete: () => void;
    onCancelExit: (title: string, message: string) => void;
    onChat?: () => void;
};

const EMERGENCY_NUMBER = '62812285777';

const formatRupiah = (n: number) =>
    `Rp${Math.round(n).toLocaleString('id-ID')}`;

function isNear(a: Coords, b: Coords, maxDeg = 0.05) {
    return (
        Math.abs(a.latitude - b.latitude) < maxDeg &&
        Math.abs(a.longitude - b.longitude) < maxDeg
    );
}

// ✅ Helper: normalisasi items dari API (order_items atau items)
function normalizeItems(raw: any): Array<{
    id?: number;
    menu_item_id?: number;
    name: string;
    variant?: string;
    qty: number;
    price: number;
    subtotal: number;
    notes?: string;
}> {
    if (!Array.isArray(raw)) return [];

    return raw.map((i) => ({
        id: i.id,
        menu_item_id: i.menu_item_id,
        name: i.name ?? 'Menu',
        variant: i.variant,
        qty: Number(i.qty ?? 0),
        price: Number(i.price ?? 0),
        subtotal: Number(i.subtotal ?? (i.qty ?? 0) * (i.price ?? 0)),
        notes: i.notes,
    }));
}

export default function FoodTripStep({
    order,
    onComplete,
    onCancelExit,
    onChat,
}: Props) {
    const insets = useSafeAreaInsets();
    const [phase, setPhase] = useState<Phase>('toResto');
    const [priceConfirmed, setPriceConfirmed] = useState(true);
    const [currentOrder, setCurrentOrder] = useState<OrderResponse | null>(null);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);

    // ============================================================
    // Alert state (pakai AppAlert)
    // ============================================================
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
        buttons?: Array<{
            text: string;
            onPress?: () => void;
            style?: 'default' | 'cancel' | 'destructive';
        }>;
    }>({
        visible: false,
        title: '',
        message: '',
        buttons: undefined,
    });

    const showAlert = (
        title: string,
        message: string,
        buttons?: Array<{
            text: string;
            onPress?: () => void;
            style?: 'default' | 'cancel' | 'destructive';
        }>
    ) => {
        setAlertState({ visible: true, title, message, buttons });
    };

    const hideAlert = () => {
        setAlertState((a) => ({ ...a, visible: false }));
    };

    // Customer info lengkap (rating & reviews)
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
    // Load detail order dari API
    // ============================================================
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const fresh = await api.orders.get(Number(order.id));

                console.log('[FOOD-TRIP] Fresh order:', {
                    id: fresh.id,
                    type: fresh.type,
                    order_items: (fresh as any).order_items?.length,
                    items: fresh.items?.length,
                    subtotal: (fresh as any).subtotal,
                });

                if (!alive) return;
                setCurrentOrder(fresh);

                // Parse customer info
                if (fresh.customer) {
                    const ratingAvg =
                        (fresh.customer as any).rating_avg ?? null;

                    const reviewCount =
                        (fresh.customer as any).total_reviews ??
                        (fresh.customer as any).stats?.review_count ??
                        0;

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

                // Sync phase dari status backend
                if (fresh.status === 'accepted') setPhase('toResto');
                else if (fresh.status === 'arrived') setPhase('atResto');
                else if (fresh.status === 'in_progress') setPhase('toCustomer');
            } catch (err: any) {
                console.warn('[FOOD-TRIP] Gagal load order:', err?.message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [order.id, order.customerName]);

    // ============================================================
    // Polling status order (deteksi cancel)
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
            } catch { }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);

        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, [order.id, order.customerName, onCancelExit]);

    // ============================================================
    // Badge unread chat
    // ============================================================
    const fetchUnread = useCallback(async () => {
        try {
            const res = await api.chat.unreadByOrder(Number(order.id));
            setUnread(res.unread);
        } catch (err: any) {
            console.warn('[FOOD-TRIP] gagal ambil unread:', err?.message);
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
    // Telepon & darurat
    // ============================================================
    const callNumber = (phone: string | null) => {
        const normalized = normalizePhone(phone);
        if (!normalized) {
            Alert.alert('Nomor tidak tersedia', 'Nomor telepon belum tersedia.');
            return;
        }
        Linking.openURL(`tel:${normalized}`).catch(() => {
            Alert.alert('Gagal', 'Tidak bisa membuka aplikasi telepon.');
        });
    };

    const handleEmergency = () => {
        const text = encodeURIComponent(
            `DARURAT! Saya driver pengantar makanan (order #${order.id}). Mohon bantuan.`
        );
        Linking.openURL(`https://wa.me/${EMERGENCY_NUMBER}?text=${text}`).catch(
            () => {
                Linking.openURL(`tel:+${EMERGENCY_NUMBER}`).catch(() => {
                    Alert.alert('Gagal', 'Tidak bisa menghubungi nomor darurat.');
                });
            }
        );
    };

    // ============================================================
    // Helper: deteksi error order tidak aktif
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
        async (
            nextPhase: Phase,
            backendStatus: 'arrived' | 'in_progress'
        ) => {
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
                console.warn('[FOOD-TRIP] Gagal update status:', msg);

                if (isOrderInactiveError(msg)) {
                    onCancelExit('Orderan Tidak Aktif', msg);
                    return;
                }

                Alert.alert(
                    'Gagal update status',
                    msg || 'Coba lagi sebentar.'
                );
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
            console.warn('[FOOD-TRIP] Gagal complete:', msg);

            if (isOrderInactiveError(msg)) {
                onCancelExit('Orderan Tidak Aktif', msg);
                return;
            }

            Alert.alert(
                'Gagal selesaikan order',
                msg || 'Coba lagi sebentar.'
            );
        } finally {
            setLoading(false);
        }
    }, [order.id, loading, onComplete, onCancelExit]);

    // ============================================================
    // Cancel order
    // ============================================================
    const handleCancel = useCallback(
        async (reason?: string) => {
            if (loading) return;
            setLoading(true);
            try {
                await api.orders.updateStatus(
                    Number(order.id),
                    'cancelled',
                    reason ?? 'Dibatalkan oleh driver'
                );

                console.log('[FOOD-TRIP] Order cancelled by driver');

                onCancelExit(
                    'Order Dibatalkan',
                    'Kamu telah membatalkan order ini.'
                );
            } catch (err: any) {
                const msg = err?.message ?? '';
                console.warn('[FOOD-TRIP] Gagal cancel:', msg);

                if (isOrderInactiveError(msg)) {
                    onCancelExit('Orderan Tidak Aktif', msg);
                    return;
                }

                showAlert(
                    'Gagal membatalkan',
                    msg || 'Coba lagi sebentar.',
                    [{ text: 'OK' }]
                );
            } finally {
                setLoading(false);
            }
        },
        [order.id, loading, onCancelExit]
    );

    // ============================================================
    // Hubungi bantuan via WhatsApp
    // ============================================================
    const handleHelp = useCallback(() => {
        const text = encodeURIComponent(
            `Halo Admin Waruung,\n\nSaya butuh bantuan terkait order *#${order.id}* (${order.type.toUpperCase()}).\n\nTerima kasih.`
        );

        const url = `https://wa.me/62812285777?text=${text}`;

        Linking.openURL(url).catch(() => {
            showAlert(
                'Gagal membuka WhatsApp',
                'Pastikan WhatsApp terinstall di HP kamu.',
                [{ text: 'OK' }]
            );
        });
    }, [order.id, order.type]);

    // ============================================================
    // Data display — semua dari API (fallback ke props)
    // ============================================================
    const displayOrder = currentOrder;

    // Customer
    const customerName = customerInfo.name;
    const customerAvatarUrl = customerInfo.avatarUrl;
    const customerPhone = customerInfo.phone;
    const customerRating = customerInfo.rating;
    const customerReviews = customerInfo.reviews;

    // ✅ ITEMS — prioritas: API order_items → API items → props order.items
    const items = useMemo(() => {
        const fromApiOrderItems = normalizeItems(
            (displayOrder as any)?.order_items
        );
        if (fromApiOrderItems.length > 0) return fromApiOrderItems;

        const fromApiItems = normalizeItems((displayOrder as any)?.items);
        if (fromApiItems.length > 0) return fromApiItems;

        const fromProps = normalizeItems(order.items);
        return fromProps;
    }, [displayOrder, order.items]);

    const itemsTotal = useMemo(
        () => items.reduce((a, i) => a + i.price * i.qty, 0),
        [items]
    );

    const packagingFee =
        (displayOrder as any)?.packaging_fee ?? order.packagingFee ?? 0;
    const deliveryFee =
        (displayOrder as any)?.delivery_fee ??
        order.deliveryFee ??
        order.fare ??
        0;

    // Total harga makanan (subtotal + packaging)
    const totalPrice = itemsTotal + packagingFee;

    // ═══════════════════════════════════════════════════════════
    // 💰 PERHITUNGAN PEMBAYARAN CASH (FOOD)
    // ═══════════════════════════════════════════════════════════
    const bayarKeResto = itemsTotal + packagingFee;
    const driverDeposit = order.driverDeposit ?? 0;
    const tagihKeCustomer = itemsTotal + packagingFee + deliveryFee;
    const pendapatanDriver = tagihKeCustomer - bayarKeResto - driverDeposit;

    // Pickup (resto)
    const pickup = {
        name: displayOrder?.pickup_name ?? order.pickup.name,
        address: displayOrder?.pickup_address ?? order.pickup.address,
        coords: displayOrder?.pickup_coords ?? order.pickup.coords,
    };

    // Dropoff (customer)
    const dropoff = {
        name: displayOrder?.dropoff_name ?? order.dropoff.name,
        address: displayOrder?.dropoff_address ?? order.dropoff.address,
        coords: displayOrder?.dropoff_coords ?? order.dropoff.coords,
    };

    // ============================================================
    // Target & warna
    // ============================================================
    const atRestaurantPhase =
        phase === 'atResto' || phase === 'preparing';

    const target =
        atRestaurantPhase || phase === 'toResto' ? pickup : dropoff;

    const targetColor =
        atRestaurantPhase || phase === 'toResto' ? '#8E44AD' : '#f26b21';

    // ============================================================
    // Koordinat driver
    // ============================================================
    const gpsCoords = location.coords;
    const fallbackDriverCoords: Coords = {
        latitude: pickup.coords.latitude - 0.006,
        longitude: pickup.coords.longitude - 0.004,
    };
    const driverCoords =
        gpsCoords && isNear(gpsCoords, pickup.coords)
            ? gpsCoords
            : phase === 'toResto'
                ? fallbackDriverCoords
                : pickup.coords;

    const safeBottomPad = Math.max(insets.bottom, 16);

    // ============================================================
    // Chat button
    // ============================================================
    const renderChatButton = () => (
        <Pressable
            style={s.chatBtn}
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
    );

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <>
            <TripMapShell
                driverCoords={driverCoords}
                targetCoords={target.coords}
                targetColor={colors.secondary}
                vehicleType="food"
                showEmergency={
                    phase === 'toResto' ||
                    phase === 'atResto' ||
                    phase === 'toCustomer'
                }
                emergencyLabel="DARURAT"
                onEmergency={handleEmergency}
                sheetHeight={
                    phase === 'preparing'
                        ? 210
                        : phase === 'atResto'
                            ? 420
                            : 240
                }
            >
                {/* CUSTOMER ROW */}
                <View style={s.customerRow}>
                    <Avatar
                        uri={customerAvatarUrl}
                        name={customerName}
                        size={40}
                        backgroundColor="#e5484d"
                    />

                    <View style={{ flex: 1 }}>
                        <Text style={s.customerLabel}>Dipesan oleh</Text>
                        <Text style={s.customerName} numberOfLines={1}>
                            {customerName}
                        </Text>

                        {customerRating != null && customerReviews > 0 ? (
                            <View style={s.ratingRow}>
                                <Ionicons
                                    name="star"
                                    size={11}
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
                                s.chatBtn,
                                !customerPhone && s.dim,
                            ]}
                            onPress={() => callNumber(customerPhone)}
                            hitSlop={8}
                        >
                            <Ionicons
                                name="call-outline"
                                size={20}
                                color={colors.text}
                            />
                        </Pressable>

                        {renderChatButton()}
                    </View>
                </View>

                <View style={s.divider} />

                {/* TARGET */}
                {phase === 'preparing' ? (
                    <View style={s.preparingRow}>
                        <View style={s.preparingIcon}>
                            <Ionicons name="bag-handle" size={20} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.stopName}>
                                Pesanan lagi disiapin
                            </Text>
                            <Text style={s.stopAddr}>
                                Tunggu jadi dulu, terus baru deh anter!
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View style={s.stopRow}>
                        <View
                            style={[
                                s.stopIcon,
                                { backgroundColor: targetColor },
                            ]}
                        >
                            <Ionicons
                                name={
                                    atRestaurantPhase ? 'restaurant' : 'person'
                                }
                                size={14}
                                color="#fff"
                            />
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
                )}

                {/* AT RESTO — Payment Info */}
                {phase === 'atResto' && (
                    <>
                        {order.restaurantLabel && (
                            <View style={s.restoBadge}>
                                <Text style={s.restoBadgeText}>
                                    {order.restaurantLabel}
                                </Text>
                            </View>
                        )}

                        <View style={s.actionRow}>
                            <Pressable
                                style={s.actionCol}
                                onPress={() => callNumber(customerPhone)}
                            >
                                <Ionicons
                                    name="call-outline"
                                    size={20}
                                    color={colors.text}
                                />
                                <Text style={s.actionText}>
                                    Telepon customer
                                </Text>
                            </Pressable>
                            <Pressable
                                style={s.actionCol}
                                onPress={() => setPhase('orderDetail')}
                            >
                                <Ionicons
                                    name="basket-outline"
                                    size={20}
                                    color={colors.text}
                                />
                                <Text style={s.actionText}>
                                    Lihat pesanan
                                </Text>
                            </Pressable>
                        </View>

                        <View style={s.divider} />

                        <Text style={s.sectionMiniTitle}>
                            Rincian Pembayaran
                        </Text>

                        <View style={s.payRow}>
                            <Text style={s.payLabel}>Subtotal makanan</Text>
                            <Text style={s.payValue}>
                                {formatRupiah(itemsTotal)}
                            </Text>
                        </View>

                        {packagingFee > 0 && (
                            <View style={s.payRow}>
                                <Text style={s.payLabel}>Biaya bungkus</Text>
                                <Text style={s.payValue}>
                                    {formatRupiah(packagingFee)}
                                </Text>
                            </View>
                        )}

                        {/* BAYAR TUNAI DI RESTO */}
                        <View style={[s.payRow, s.payRowHighlightOrange]}>
                            <View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <Ionicons
                                    name="wallet-outline"
                                    size={14}
                                    color="#E67E22"
                                />
                                <Text style={s.payLabelBoldOrange}>
                                    Bayar tunai di resto
                                </Text>
                            </View>
                            <Text style={s.payValueBoldOrange}>
                                {formatRupiah(bayarKeResto)}
                            </Text>
                        </View>

                        <View style={s.payRow}>
                            <Text style={s.payLabel}>
                                Ongkir
                            </Text>
                            <Text style={s.payValue}>
                                {formatRupiah(deliveryFee)}
                            </Text>
                        </View>

                        {/* TAGIH TUNAI KE CUSTOMER */}
                        <View style={[s.payRow, s.payRowHighlightGreen]}>
                            <View
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <Ionicons
                                    name="cash-outline"
                                    size={14}
                                    color="#1AA260"
                                />
                                <Text style={s.payLabelBoldGreen}>
                                    Tagih tunai ke customer
                                </Text>
                            </View>
                            <Text style={s.payValueBoldGreen}>
                                {formatRupiah(tagihKeCustomer)}
                            </Text>
                        </View>

                        {/* INFO BOX */}
                        <View style={s.infoBox}>
                            <Ionicons
                                name="information-circle-outline"
                                size={16}
                                color={colors.primary}
                            />
                            <Text style={s.infoText}>
                                Kamu{' '}
                                <Text style={s.infoTextBold}>bayar dulu</Text>{' '}
                                makanannya ke resto sebesar{' '}
                                <Text style={s.infoTextBold}>
                                    {formatRupiah(bayarKeResto)}
                                </Text>
                                , lalu{' '}
                                <Text style={s.infoTextBold}>tagih</Text> ke
                                customer sebesar{' '}
                                <Text style={s.infoTextBold}>
                                    {formatRupiah(tagihKeCustomer)}
                                </Text>
                                . Pendapatanmu:{' '}
                                <Text style={s.infoTextBoldGreen}>
                                    {formatRupiah(pendapatanDriver)}
                                </Text>
                                .
                            </Text>
                        </View>
                    </>
                )}

                {/* SWIPE BUTTONS */}
                {phase === 'toResto' && (
                    <SwipeButton
                        label={loading ? 'Memproses…' : 'Udah di resto'}
                        color="#1877F2"
                        onConfirm={() =>
                            handlePhaseChange('atResto', 'arrived')
                        }
                    />
                )}
                {phase === 'preparing' && (
                    <SwipeButton
                        label={loading ? 'Memproses…' : 'Mulai pengantaran'}
                        color="#1877F2"
                        onConfirm={() =>
                            handlePhaseChange('toCustomer', 'in_progress')
                        }
                    />
                )}
                {phase === 'toCustomer' && (
                    <SwipeButton
                        label={loading ? 'Memproses…' : 'Selesai antar'}
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

            {/* MODAL: Detail Pesanan */}
            <Modal
                visible={phase === 'orderDetail'}
                animationType="slide"
                transparent
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                        <Pressable
                            style={s.modalBackdrop}
                            onPress={() => setPhase('atResto')}
                        />
                        <View
                            style={[
                                s.detailSheet,
                                { paddingBottom: safeBottomPad + 12 },
                            ]}
                        >
                            <View style={s.handleAreaModal}>
                                <View style={s.handleModal} />
                            </View>
                            <ScrollView style={{ maxHeight: 320 }}>
                                {items.map((it, idx) => (
                                    <View key={idx} style={s.itemRow}>
                                        <View style={{ flex: 1 }}>
                                            {it.variant && (
                                                <Text style={s.itemCategory}>
                                                    {it.variant}
                                                </Text>
                                            )}
                                            <Text style={s.itemName}>
                                                {it.name}
                                            </Text>
                                            <Text style={s.itemQty}>
                                                {it.qty} x{' '}
                                                {formatRupiah(it.price)}
                                            </Text>
                                        </View>
                                        <View style={s.itemQtyBadge}>
                                            <Text style={s.itemQtyBadgeText}>
                                                {it.qty}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                                <View style={s.itemRow}>
                                    <Text style={s.itemLabel}>
                                        Jumlah pesanan
                                    </Text>
                                    <Text style={s.itemValue}>
                                        {items.reduce(
                                            (a, i) => a + (i.qty ?? 0),
                                            0
                                        )}
                                    </Text>
                                </View>
                                {packagingFee > 0 && (
                                    <View style={s.itemRow}>
                                        <Text style={s.itemLabel}>
                                            Biaya bungkus
                                        </Text>
                                        <Text style={s.itemValue}>
                                            {formatRupiah(packagingFee)}
                                        </Text>
                                    </View>
                                )}
                                <View style={s.itemRow}>
                                    <Text style={s.itemLabelBold}>
                                        Total harga
                                    </Text>
                                    <Text style={s.itemValueBold}>
                                        {formatRupiah(totalPrice)}
                                    </Text>
                                </View>
                            </ScrollView>

                            <View style={s.detailFooterRow}>
                                {/* ── CANCEL ── langsung proses ── */}
                                <Pressable
                                    style={[s.detailFooterBtn, loading && s.dim]}
                                    disabled={loading}
                                    onPress={() => handleCancel('Dibatalkan oleh driver')}
                                >
                                    {loading ? (
                                        <ActivityIndicator size="small" color={colors.danger} />
                                    ) : (
                                        <Ionicons
                                            name="close-circle-outline"
                                            size={20}
                                            color={colors.danger}
                                        />
                                    )}
                                    <Text style={[s.detailFooterText, { color: colors.danger }]}>
                                        {loading ? 'Memproses...' : 'Cancel'}
                                    </Text>
                                </Pressable>

                                {/* ── BANTUAN ── langsung buka WA ── */}
                                <Pressable
                                    style={s.detailFooterBtn}
                                    onPress={handleHelp}
                                >
                                    <Ionicons
                                        name="help-circle-outline"
                                        size={20}
                                        color={colors.text}
                                    />
                                    <Text style={s.detailFooterText}>Bantuan</Text>
                                </Pressable>
                            </View>
                            <SwipeButton
                                label="Udah beli pesanan"
                                color="#1877F2"
                                onConfirm={() => setPhase('priceConfirm')}
                            />
                        </View>
                    </View>
                </GestureHandlerRootView>
            </Modal>

            {/* MODAL: Konfirmasi Harga */}
            <Modal
                visible={phase === 'priceConfirm'}
                animationType="slide"
                transparent
            >
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <View
                        style={[
                            s.priceSheet,
                            { paddingBottom: safeBottomPad + 16 },
                        ]}
                    >
                        <View style={s.priceHeader}>
                            <Ionicons
                                name="arrow-back"
                                size={22}
                                color={colors.text}
                                onPress={() => setPhase('orderDetail')}
                            />
                            <Text style={s.priceHeaderTitle}>
                                Harga pesanan
                            </Text>
                        </View>
                        <Text style={s.priceQuestion}>
                            Apakah harga ini benar?
                        </Text>
                        <Text style={s.priceSub}>
                            Total harga di struk belanja
                        </Text>
                        <Text style={s.priceBig}>
                            {formatRupiah(totalPrice)}
                        </Text>

                        <Pressable
                            style={s.radioRow}
                            onPress={() => setPriceConfirmed(true)}
                        >
                            <View
                                style={[
                                    s.radio,
                                    priceConfirmed && s.radioActive,
                                ]}
                            >
                                {priceConfirmed && <View style={s.radioDot} />}
                            </View>
                            <Text style={s.radioLabel}>
                                Ya, harga ini benar
                            </Text>
                        </Pressable>
                        <Pressable
                            style={s.radioRow}
                            onPress={() => setPriceConfirmed(false)}
                        >
                            <View
                                style={[
                                    s.radio,
                                    !priceConfirmed && s.radioActive,
                                ]}
                            >
                                {!priceConfirmed && <View style={s.radioDot} />}
                            </View>
                            <Text style={s.radioLabel}>
                                Gak, harga ini perlu diedit
                            </Text>
                        </Pressable>

                        <Pressable
                            style={s.lanjutBtn}
                            onPress={() => setPhase('preparing')}
                        >
                            <Text style={s.lanjutText}>LANJUT</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </>
    );
}

// ============================================================
// STYLES — sama seperti sebelumnya
// ============================================================
const s = StyleSheet.create({
    customerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
    },
    customerLabel: { fontSize: 12, color: colors.textMuted },
    customerName: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
        marginTop: 1,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    customerRating: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    chatBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
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
    dim: { opacity: 0.4 },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: 10,
    },
    stopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    stopIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stopName: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    stopAddr: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    preparingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    preparingIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#40a3ea',
        alignItems: 'center',
        justifyContent: 'center',
    },
    restoBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#8E44AD',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 10,
    },
    restoBadgeText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 11,
    },
    actionRow: { flexDirection: 'row', marginBottom: 6 },
    actionCol: {
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
    },
    actionText: {
        fontSize: 12,
        color: colors.text,
        fontWeight: '600',
    },
    sectionMiniTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    payRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    payLabel: { fontSize: 13, color: colors.textMuted },
    payValue: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },
    payRowHighlightOrange: {
        backgroundColor: '#FFF7E6',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        marginTop: 6,
    },
    payLabelBoldOrange: {
        fontSize: 13,
        fontWeight: '800',
        color: '#E67E22',
    },
    payValueBoldOrange: {
        fontSize: 15,
        fontWeight: '900',
        color: '#E67E22',
    },
    payRowHighlightGreen: {
        backgroundColor: '#E8F7EE',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        marginTop: 6,
    },
    payLabelBoldGreen: {
        fontSize: 13,
        fontWeight: '800',
        color: '#1AA260',
    },
    payValueBoldGreen: {
        fontSize: 15,
        fontWeight: '900',
        color: '#1AA260',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: '#EAF5FD',
        borderRadius: 10,
        padding: 10,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#BFE0F8',
    },
    infoText: {
        flex: 1,
        fontSize: 11,
        color: '#374151',
        lineHeight: 17,
    },
    infoTextBold: {
        fontWeight: '800',
        color: '#111827',
    },
    infoTextBoldGreen: {
        fontWeight: '900',
        color: '#1AA260',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 12,
        right: 12,
    },
    modalBackdrop: { flex: 1 },
    detailSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: 16,
    },
    handleAreaModal: {
        alignItems: 'center',
        paddingBottom: 10,
    },
    handleModal: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c9ccd1',
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    itemCategory: { fontSize: 11, color: colors.textMuted },
    itemName: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
        marginTop: 2,
    },
    itemQty: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },
    itemQtyBadge: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.field,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemQtyBadgeText: {
        fontWeight: '800',
        color: colors.text,
    },
    itemLabel: { fontSize: 14, color: colors.text },
    itemValue: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    itemLabelBold: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
    },
    itemValueBold: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    detailFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginVertical: 14,
    },
    detailFooterBtn: { alignItems: 'center', gap: 4 },
    detailFooterText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.text,
    },
    priceSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: 20,
    },
    priceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 24,
    },
    priceHeaderTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    priceQuestion: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 16,
    },
    priceSub: { fontSize: 13, color: colors.textMuted },
    priceBig: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.text,
        marginVertical: 10,
        marginBottom: 20,
    },
    radioRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioActive: { borderColor: '#1AA260' },
    radioDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#1AA260',
    },
    radioLabel: { fontSize: 15, color: colors.text },
    lanjutBtn: {
        height: 54,
        borderRadius: 27,
        backgroundColor: '#1AA260',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
    },
    lanjutText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 16,
        letterSpacing: 0.5,
    },
});