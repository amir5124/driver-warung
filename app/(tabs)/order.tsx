// app/(tabs)/order.tsx
import AppAlert from '@/components/AppAlert';
import Avatar from '@/components/Avatar';
import LoadingModal from '@/components/LoadingModal';
import { colors } from '@/constants/ojek-theme';
import { activeOrderStore } from '@/lib/activeOrderStore';
import { api, OrderResponse } from '@/lib/api-driver';
import type { DriverOrder } from '@/types/driver';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import {
    SafeAreaView,
    useSafeAreaInsets,
} from 'react-native-safe-area-context';

// ============================================================
// TYPES
// ============================================================
type TabKey = 'active' | 'history';
type TypeFilter = 'ride' | 'send' | 'food' | null;
type Status = OrderResponse['status'];

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

// ============================================================
// ASSETS
// ============================================================
const IMG_MOTOR = require('@/assets/images/motor.png');
const IMG_MOBIL = require('@/assets/images/mobil.png');

const isCarOrder = (o: OrderResponse) => {
    const raw = o as any;
    const key = `${raw.tariff_code ?? ''} ${raw.option_name ?? ''}`.toLowerCase();
    return key.includes('car') || key.includes('mobil');
};

const getOrderImage = (o: OrderResponse) =>
    isCarOrder(o) ? IMG_MOBIL : IMG_MOTOR;

// ============================================================
// KONFIGURASI
// ============================================================
const TYPE_LABEL: Record<OrderResponse['type'], string> = {
    ride: 'WarJek',
    send: 'WarSend',
    food: 'WarFood',
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
    pending: { label: 'Menunggu', color: '#f5a623' },
    accepted: { label: 'Diterima', color: '#40a3ea' },
    arrived: { label: 'Di lokasi', color: '#1AAD5B' },
    in_progress: { label: 'Dalam perjalanan', color: '#1AAD5B' },
    completed: { label: 'Selesai', color: '#1AAD5B' },
    cancelled: { label: 'Dibatalkan', color: '#e5484d' },
};

const HISTORY_STATUSES: Status[] = ['completed', 'cancelled'];
const ACTIVE_STATUSES: Status[] = [
    'pending',
    'accepted',
    'arrived',
    'in_progress',
];

// ============================================================
// KONFIGURASI LABEL TOMBOL AKSI PER STATUS
// ============================================================
type NextStep = {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    confirmTitle?: string;
    confirmMessage?: string;
};

/**
 * Label tombol aksi berdasarkan status order.
 * Actual logic ada di trip step — di sini hanya trigger navigasi.
 */
const NEXT_STEP_LABEL: Partial<Record<Status, NextStep>> = {
    pending: {
        label: 'Terima Order',
        icon: 'checkmark-circle',
        confirmTitle: 'Terima order ini?',
        confirmMessage: 'Order akan diterima dan kamu bisa mulai menjemput.',
    },
    accepted: {
        label: 'Mulai Perjalanan',
        icon: 'play-circle',
    },
    arrived: {
        label: 'Mulai Perjalanan',
        icon: 'play-circle',
    },
    in_progress: {
        label: 'Lanjutkan Order',
        icon: 'arrow-forward-circle',
    },
};

// ============================================================
// HELPERS
// ============================================================
const formatRupiah = (n: number) =>
    'Rp' + Math.round(n || 0).toLocaleString('id-ID');

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const formatDate = (iso: string) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
};

const shortAddress = (name?: string | null) => {
    if (!name) return '—';
    return name.split(',')[0].trim();
};

const byNewest = (a: OrderResponse, b: OrderResponse) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

// ============================================================
// 🆕 ADAPTER: OrderResponse → DriverOrder
// ============================================================
const FALLBACK_COORDS = { latitude: -6.9021, longitude: 110.7543 };

function toDriverOrder(o: OrderResponse): DriverOrder {
    const pickupCoords = o.pickup_coords ?? FALLBACK_COORDS;
    const dropoffCoords = o.dropoff_coords ?? FALLBACK_COORDS;

    const base: DriverOrder = {
        id: String(o.id),
        type:
            o.type === 'send'
                ? 'send'
                : o.type === 'food'
                    ? 'food'
                    : 'ride',
        customerName: o.customer?.full_name ?? 'Customer',
        customerRating: o.customer?.rating_avg ?? null,   // ✅ default null
        customerReviews: o.customer?.total_reviews ?? 0,
        customerAvatar: o.customer?.avatar_url ?? undefined,
        pickup: {
            name: o.pickup_name ?? 'Titik jemput',
            address: o.pickup_address ?? '',
            coords: pickupCoords,
        },
        dropoff: {
            name: o.dropoff_name ?? 'Tujuan',
            address: o.dropoff_address ?? '',
            coords: dropoffCoords,
        },
        distanceKm: o.distance_km ?? 0,
        fare: o.driver_earning ?? o.delivery_fee ?? o.total_fare ?? 0,
    };

    if (o.type === 'send') {
        base.receiverName = o.receiver_name ?? 'Penerima';
        base.receiverPhone = o.receiver_phone ?? '';
        base.senderPhone = o.sender_phone ?? '';
    }

    return base;
}
// ============================================================
// SCREEN
// ============================================================
export default function OrderTabScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [orders, setOrders] = useState<OrderResponse[]>([]);
    const [activeOrder, setActiveOrderState] = useState<DriverOrder | null>(
        activeOrderStore.get()
    );
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const [tab, setTab] = useState<TabKey>('active');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>(null);
    const [statusFilter, setStatusFilter] = useState<Status | null>(null);
    const [statusOpen, setStatusOpen] = useState(false);

    // Alert
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

    const hideAlert = () => {
        setAlertState((a) => ({ ...a, visible: false }));
    };

    // ============================================================
    // LOAD ORDERS
    // ============================================================
    const loadOrders = useCallback(async () => {
        try {
            const list = await api.orders.listMine();
            setOrders(list);
        } catch (err: any) {
            console.warn('[ORDER-TAB] Gagal load:', err.message);
            setAlertState({
                visible: true,
                title: 'Gagal memuat order',
                message: err?.message || 'Coba lagi sebentar.',
                buttons: [
                    { text: 'Tutup', style: 'cancel' },
                    { text: 'Coba lagi', onPress: () => loadOrders() },
                ],
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            setActiveOrderState(activeOrderStore.get());
            loadOrders();

            const unsub = activeOrderStore.subscribe((o) => {
                setActiveOrderState(o);
            });
            return () => unsub();
        }, [loadOrders])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadOrders();
    };

    // ============================================================
    // DATA TURUNAN
    // ============================================================
    const activeApiOrders = useMemo(
        () =>
            orders
                .filter((o) => ACTIVE_STATUSES.includes(o.status))
                .filter(
                    (o) =>
                        !activeOrder || String(o.id) !== String(activeOrder.id)
                )
                .sort(byNewest),
        [orders, activeOrder]
    );

    const historyOrders = useMemo(
        () =>
            orders
                .filter((o) => HISTORY_STATUSES.includes(o.status))
                .filter((o) => (typeFilter ? o.type === typeFilter : true))
                .filter((o) =>
                    statusFilter ? o.status === statusFilter : true
                )
                .sort(byNewest),
        [orders, typeFilter, statusFilter]
    );

    const historySummary = useMemo(() => {
        const done = historyOrders.filter((o) => o.status === 'completed');
        return {
            doneCount: done.length,
            income: done.reduce(
                (sum, o) => sum + (o.driver_earning ?? 0),
                0
            ),
        };
    }, [historyOrders]);

    const activeCount = (activeOrder ? 1 : 0) + activeApiOrders.length;

    const changeTab = (key: TabKey) => {
        setTab(key);
        setStatusOpen(false);
    };

    const toggleType = (t: 'ride' | 'send' | 'food') =>
        setTypeFilter((cur) => (cur === t ? null : t));

    // ============================================================
    // 🆕 HANDLERS — Lanjut ke Trip Step
    // ============================================================

    /**
     * Resume order aktif — balik ke DriverFlow (tab index)
     * DriverFlow akan otomatis render trip step yang sesuai.
     */
    const handleResume = () => {
        router.push('/(tabs)');
    };

    const handlePressOrder = (order: OrderResponse) => {
        router.push({
            pathname: '/order-detail',
            params: { order: JSON.stringify(order) },
        });
    };

    /**
     * 🆕 Advance order — kalau status `pending` (belum accepted),
     * panggil `api.orders.accept` dulu, lalu set activeOrderStore.
     * Kalau sudah `accepted`/`arrived`/`in_progress`,
     * tinggal set activeOrderStore & navigate ke tab index.
     */
    const runAdvance = async (order: OrderResponse) => {
        const id = String(order.id);
        setUpdatingId(id);

        try {
            // ── 1. Kalau pending → accept dulu ──
            if (order.status === 'pending') {
                console.log('[ORDER-TAB] Accept order:', id);
                const accepted = await api.orders.accept(Number(order.id));

                // Update state
                setOrders((prev) =>
                    prev.map((o) =>
                        String(o.id) === id ? accepted : o
                    )
                );

                // Simpan ke activeOrderStore
                const driverOrder = toDriverOrder(accepted);
                await activeOrderStore.set(driverOrder);
                setActiveOrderState(driverOrder);
            } else {
                // ── 2. Kalau sudah accepted/arrived/in_progress ──
                // Langsung set activeOrderStore
                const driverOrder = toDriverOrder(order);
                await activeOrderStore.set(driverOrder);
                setActiveOrderState(driverOrder);
            }

            // ── 3. Navigate ke tab index — DriverFlow akan render trip step ──
            router.push('/(tabs)');
        } catch (err: any) {
            console.warn('[ORDER-TAB] Gagal advance:', err.message);
            setAlertState({
                visible: true,
                title: 'Gagal melanjutkan order',
                message: err?.message || 'Coba lagi sebentar.',
                buttons: [
                    { text: 'Tutup', style: 'cancel' },
                    {
                        text: 'Coba lagi',
                        onPress: () => runAdvance(order),
                    },
                ],
            });
        } finally {
            setUpdatingId(null);
        }
    };

    /**
     * Konfirmasi + jalankan advance
     */
    const handleAdvance = (order: OrderResponse) => {
        const step = NEXT_STEP_LABEL[order.status];
        if (!step) return;

        // Kalau ada konfirmasi (pending → accept)
        if (step.confirmTitle && step.confirmMessage) {
            setAlertState({
                visible: true,
                title: step.confirmTitle,
                message: step.confirmMessage,
                buttons: [
                    { text: 'Batal', style: 'cancel' },
                    {
                        text: 'Ya, lanjut',
                        onPress: () => runAdvance(order),
                    },
                ],
            });
        } else {
            // Langsung jalan (accepted, arrived, in_progress)
            runAdvance(order);
        }
    };

    // ============================================================
    // RENDER CARD ORDER (aktif / riwayat)
    // ============================================================
    const renderOrder = (order: OrderResponse) => {
        const isCancelled = order.status === 'cancelled';
        const isDone = order.status === 'completed';
        const dim = isCancelled || isDone;

        const step = NEXT_STEP_LABEL[order.status];
        const isUpdating = updatingId === String(order.id);

        const title =
            order.type === 'send'
                ? order.receiver_name
                    ? `Kirim ke ${order.receiver_name}`
                    : 'Pengiriman paket'
                : shortAddress(order.dropoff_name);

        const address = order.dropoff_address || order.dropoff_name;

        const statusText = `${TYPE_LABEL[order.type]} ${STATUS_META[order.status].label.toLowerCase()
            }`;

        const statusColor = STATUS_META[order.status].color;
        const statusIcon = isCancelled
            ? 'alert-circle'
            : isDone
                ? 'checkmark-circle'
                : 'time';

        return (
            <Pressable
                key={order.id}
                style={({ pressed }) => [
                    s.card,
                    !isCancelled && s.cardActive,
                    pressed && { opacity: 0.9 },
                ]}
                onPress={() => handlePressOrder(order)}
            >
                <Text style={s.cardDate}>
                    {formatDate(order.created_at)}
                </Text>

                <View style={s.cardBody}>
                    <View
                        style={[s.imgBox, !isCancelled && s.imgBoxActive]}
                    >
                        <Image
                            source={getOrderImage(order)}
                            style={[
                                s.img,
                                isCancelled && { opacity: 0.55 },
                            ]}
                        />
                    </View>

                    <View style={{ flex: 1 }}>
                        <View style={s.titleRow}>
                            <Text
                                style={[
                                    s.cardTitle,
                                    dim && s.cardTitleDim,
                                ]}
                                numberOfLines={1}
                            >
                                {title}
                            </Text>
                            <Text
                                style={[
                                    s.fare,
                                    isDone && {
                                        color: '#1AA260',
                                        fontWeight: '800',
                                    },
                                ]}
                            >
                                {isCancelled
                                    ? 'Rp0'
                                    : formatRupiah(
                                        order.driver_earning ??
                                        order.total_fare
                                    )}
                            </Text>
                        </View>

                        {!!address && (
                            <Text
                                style={s.cardAddress}
                                numberOfLines={1}
                            >
                                {address}
                            </Text>
                        )}

                        <View style={s.statusRow}>
                            <Ionicons
                                name={statusIcon as any}
                                size={20}
                                color={statusColor}
                            />
                            <Text
                                style={s.statusText}
                                numberOfLines={1}
                            >
                                {statusText}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ⬇️ ACTION: lanjut ke trip step */}
                {step && (
                    <Pressable
                        onPress={() => handleAdvance(order)}
                        disabled={isUpdating}
                        style={({ pressed }) => [
                            s.advanceBtn,
                            (pressed || isUpdating) && { opacity: 0.8 },
                        ]}
                    >
                        {isUpdating ? (
                            <ActivityIndicator
                                size="small"
                                color="#fff"
                            />
                        ) : (
                            <>
                                <Ionicons
                                    name={step.icon}
                                    size={20}
                                    color="#fff"
                                />
                                <Text style={s.advanceText}>
                                    {step.label}
                                </Text>
                            </>
                        )}
                    </Pressable>
                )}
            </Pressable>
        );
    };

    // ============================================================
    // RENDER CARD ORDER BERJALAN (dari activeOrderStore)
    // ============================================================
    const renderActiveOrder = (order: DriverOrder) => {
        const typeLabel = TYPE_LABEL[order.type];

        return (
            <View key={order.id} style={s.activeCard}>
                <View style={s.cardHeader}>
                    <View style={s.brandBox}>
                        <Ionicons
                            name="bicycle"
                            size={16}
                            color="#fff"
                        />
                        <Text style={s.brandText}>{typeLabel}</Text>
                    </View>
                    <View style={s.liveDot}>
                        <View style={s.liveDotInner} />
                        <Text style={s.liveText}>
                            Sedang berjalan
                        </Text>
                    </View>
                </View>

                <View style={s.routeWrap}>
                    <View style={s.routeRow}>
                        <View
                            style={[
                                s.pin,
                                { backgroundColor: colors.primary },
                            ]}
                        >
                            <Ionicons
                                name="arrow-up"
                                size={14}
                                color="#fff"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.caption}>Jemput</Text>
                            <Text style={s.addr} numberOfLines={1}>
                                {order.pickup.name}
                            </Text>
                            <Text style={s.subAddr} numberOfLines={1}>
                                {order.pickup.address}
                            </Text>
                        </View>
                    </View>

                    <View style={s.dottedLine} />

                    <View style={s.routeRow}>
                        <View
                            style={[
                                s.pin,
                                { backgroundColor: '#f26b21' },
                            ]}
                        >
                            <Ionicons
                                name="arrow-down"
                                size={14}
                                color="#fff"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.caption}>Tujuan</Text>
                            <Text style={s.addr} numberOfLines={1}>
                                {order.dropoff.name}
                            </Text>
                            <Text style={s.subAddr} numberOfLines={1}>
                                {order.dropoff.address}
                            </Text>
                        </View>
                    </View>
                </View>

                <View style={s.customerRow}>
                    {/* ✅ Avatar — pakai komponen Avatar */}
                    <Avatar
                        uri={order.customerAvatar ?? null}
                        name={order.customerName}
                        size={40}
                        backgroundColor={colors.primary}
                    />

                    <View style={{ flex: 1 }}>
                        <Text style={s.customerName} numberOfLines={1}>
                            {order.customerName}
                        </Text>

                        {/* ✅ Rating — handle null */}
                        {order.customerRating != null && order.customerReviews > 0 ? (
                            <View style={s.ratingRow}>
                                <Ionicons name="star" size={12} color="#F5A623" />
                                <Text style={s.customerMeta}>
                                    {Number(order.customerRating).toFixed(1)} •{' '}
                                    {order.customerReviews} ulasan
                                </Text>
                            </View>
                        ) : (
                            <Text style={s.customerMeta}>Customer baru</Text>
                        )}
                    </View>

                    <Text style={s.activeFare}>
                        {formatRupiah(order.fare)}
                    </Text>
                </View>

                <Pressable
                    onPress={handleResume}
                    style={({ pressed }) => [
                        s.resumeBtn,
                        pressed && { opacity: 0.85 },
                    ]}
                >
                    <Ionicons
                        name="play-circle"
                        size={22}
                        color="#fff"
                    />
                    <Text style={s.resumeText}>
                        Lanjutkan Order
                    </Text>
                </Pressable>
            </View>
        );
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <SafeAreaView style={s.container} edges={['top']}>
            <View style={s.header}>
                <Text style={s.headerTitle}>Order</Text>
            </View>

            <View style={s.tabsRow}>
                <Pressable
                    onPress={() => changeTab('active')}
                    style={[s.tab, tab === 'active' && s.tabActive]}
                >
                    <Text
                        style={[
                            s.tabText,
                            tab === 'active' && s.tabTextActive,
                        ]}
                    >
                        Dalam Proses
                    </Text>
                    {activeCount > 0 && (
                        <View style={s.tabBadge}>
                            <Text style={s.tabBadgeText}>
                                {activeCount}
                            </Text>
                        </View>
                    )}
                </Pressable>

                <Pressable
                    onPress={() => changeTab('history')}
                    style={[s.tab, tab === 'history' && s.tabActive]}
                >
                    <Text
                        style={[
                            s.tabText,
                            tab === 'history' && s.tabTextActive,
                        ]}
                    >
                        Riwayat
                    </Text>
                </Pressable>
            </View>

            <ScrollView
                contentContainerStyle={[
                    s.scrollContent,
                    { paddingBottom: insets.bottom + 100 },
                ]}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[colors.primary]}
                        tintColor={colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* ═══════════════ TAB: DALAM PROSES ═══════════════ */}
                {tab === 'active' && (
                    <>
                        {activeOrder ? (
                            <>
                                <Text style={s.sectionTitle}>
                                    Order Berjalan
                                </Text>
                                {renderActiveOrder(activeOrder)}
                            </>
                        ) : null}

                        {activeApiOrders.length > 0 && (
                            <>
                                {activeOrder && (
                                    <Text
                                        style={[
                                            s.sectionTitle,
                                            { marginTop: 20 },
                                        ]}
                                    >
                                        Order Lainnya
                                    </Text>
                                )}
                                {activeApiOrders.map(renderOrder)}
                            </>
                        )}

                        {!loading && activeCount === 0 && (
                            <View style={s.emptyWrap}>
                                <View style={s.emptyIcon}>
                                    <Ionicons
                                        name="cube-outline"
                                        size={42}
                                        color={colors.textMuted}
                                    />
                                </View>
                                <Text style={s.emptyTitle}>
                                    Tidak ada order aktif
                                </Text>
                                <Text style={s.emptyDesc}>
                                    Order yang kamu terima akan muncul
                                    di sini.{'\n'}Kalau tidak sengaja
                                    keluar dari trip, kamu bisa
                                    lanjutkan dari sini.
                                </Text>
                            </View>
                        )}
                    </>
                )}

                {/* ═══════════════ TAB: RIWAYAT ═══════════════ */}
                {tab === 'history' && (
                    <>
                        <View style={s.summaryCard}>
                            <View style={s.summaryCol}>
                                <Text style={s.summaryLabel}>
                                    Order selesai
                                </Text>
                                <Text style={s.summaryValue}>
                                    {historySummary.doneCount}
                                </Text>
                            </View>
                            <View style={s.summaryDivider} />
                            <View style={s.summaryCol}>
                                <Text style={s.summaryLabel}>
                                    Total penghasilan
                                </Text>
                                <Text
                                    style={[
                                        s.summaryValue,
                                        { color: '#1AA260' },
                                    ]}
                                >
                                    {formatRupiah(
                                        historySummary.income
                                    )}
                                </Text>
                            </View>
                        </View>

                        <View style={s.chipsRow}>
                            {(['ride', 'send', 'food'] as const).map(
                                (t) => (
                                    <Pressable
                                        key={t}
                                        onPress={() => toggleType(t)}
                                        style={[
                                            s.chip,
                                            typeFilter === t &&
                                            s.chipActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                s.chipText,
                                                typeFilter === t &&
                                                s.chipTextActive,
                                            ]}
                                        >
                                            {TYPE_LABEL[t]}
                                        </Text>
                                    </Pressable>
                                )
                            )}

                            <Pressable
                                onPress={() =>
                                    setStatusOpen((v) => !v)
                                }
                                style={[
                                    s.chip,
                                    !!statusFilter && s.chipActive,
                                ]}
                            >
                                <Text
                                    style={[
                                        s.chipText,
                                        !!statusFilter &&
                                        s.chipTextActive,
                                    ]}
                                >
                                    {statusFilter
                                        ? STATUS_META[statusFilter]
                                            .label
                                        : 'Status'}
                                </Text>
                                <Ionicons
                                    name={
                                        statusOpen
                                            ? 'chevron-up'
                                            : 'chevron-down'
                                    }
                                    size={18}
                                    color={
                                        statusFilter
                                            ? colors.primary
                                            : '#1f2933'
                                    }
                                />
                            </Pressable>
                        </View>

                        {statusOpen && (
                            <View style={s.dropdown}>
                                <Pressable
                                    style={s.dropdownItem}
                                    onPress={() => {
                                        setStatusFilter(null);
                                        setStatusOpen(false);
                                    }}
                                >
                                    <Text style={s.dropdownText}>
                                        Semua status
                                    </Text>
                                    {!statusFilter && (
                                        <Ionicons
                                            name="checkmark"
                                            size={18}
                                            color={colors.primary}
                                        />
                                    )}
                                </Pressable>
                                {HISTORY_STATUSES.map((st) => (
                                    <Pressable
                                        key={st}
                                        style={s.dropdownItem}
                                        onPress={() => {
                                            setStatusFilter(st);
                                            setStatusOpen(false);
                                        }}
                                    >
                                        <Text
                                            style={s.dropdownText}
                                        >
                                            {
                                                STATUS_META[st]
                                                    .label
                                            }
                                        </Text>
                                        {statusFilter === st && (
                                            <Ionicons
                                                name="checkmark"
                                                size={18}
                                                color={
                                                    colors.primary
                                                }
                                            />
                                        )}
                                    </Pressable>
                                ))}
                            </View>
                        )}

                        {!loading && historyOrders.length === 0 ? (
                            <View style={s.emptyWrap}>
                                <View style={s.emptyIcon}>
                                    <Ionicons
                                        name="receipt-outline"
                                        size={40}
                                        color={colors.textMuted}
                                    />
                                </View>
                                <Text style={s.emptyTitle}>
                                    Belum ada riwayat
                                </Text>
                                <Text style={s.emptyDesc}>
                                    {typeFilter || statusFilter
                                        ? 'Tidak ada order yang cocok dengan filter ini.'
                                        : 'Riwayat order yang sudah selesai akan muncul di sini.'}
                                </Text>
                            </View>
                        ) : (
                            historyOrders.map(renderOrder)
                        )}
                    </>
                )}
            </ScrollView>

            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={alertState.buttons}
                onClose={hideAlert}
            />

            <LoadingModal visible={loading} />
        </SafeAreaView>
    );
}

// ============================================================
// STYLES (tidak berubah)
// ============================================================
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    header: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#d9dce1',
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: '#1f2933' },

    tabsRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 24,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: colors.primary },
    tabText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#9aa1ac',
    },
    tabTextActive: { color: '#1f2933' },
    tabBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 6,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
    },

    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#8a94a6',
        letterSpacing: 0.5,
        marginBottom: 10,
        textTransform: 'uppercase',
    },

    summaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5FBF7',
        borderWidth: 1.5,
        borderColor: '#c8ecd5',
        borderRadius: 18,
        paddingVertical: 14,
        marginBottom: 16,
    },
    summaryCol: { flex: 1, alignItems: 'center' },
    summaryDivider: {
        width: 1,
        height: 36,
        backgroundColor: '#c8ecd5',
    },
    summaryLabel: {
        fontSize: 12,
        color: '#6b7280',
        fontWeight: '600',
    },
    summaryValue: {
        fontSize: 18,
        fontWeight: '900',
        color: '#1f2933',
        marginTop: 4,
    },

    emptyWrap: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 20,
    },
    emptyIcon: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: '#EDEEF0',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#1f2933',
        marginBottom: 6,
    },
    emptyDesc: {
        fontSize: 13,
        color: '#8a94a6',
        textAlign: 'center',
        lineHeight: 20,
    },

    activeCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 18,
        borderWidth: 2,
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOpacity: 0.25,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    brandBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.primary,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    brandText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 13,
    },
    liveDot: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#e6f7ee',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    liveDotInner: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#1AA260',
    },
    liveText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1AA260',
    },

    routeWrap: { marginBottom: 16 },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    pin: {
        width: 26,
        height: 26,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    caption: {
        fontSize: 11,
        fontWeight: '700',
        color: '#8a8f98',
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    addr: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1f2933',
        marginTop: 2,
    },
    subAddr: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2,
    },
    dottedLine: {
        marginLeft: 12,
        height: 18,
        borderLeftWidth: 2,
        borderLeftColor: '#c9cdd3',
        borderStyle: 'dotted',
    },

    customerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        backgroundColor: '#F5F6F8',
        borderRadius: 14,
        marginBottom: 14,
    },
    customerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e3f6f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    customerName: {
        fontSize: 14,
        fontWeight: '800',
        color: '#1f2933',
    },
    customerMeta: {
        fontSize: 12,
        color: '#8a94a6',
        marginTop: 2,
    },
    activeFare: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1AA260',
    },

    resumeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.primary,
    },
    resumeText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },

    card: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#eef0f3',
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    cardActive: {
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOpacity: 0.5,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 12,
    },
    cardDate: {
        fontSize: 14,
        fontWeight: '800',
        color: '#4b5563',
        marginBottom: 12,
    },
    cardBody: {
        flexDirection: 'row',
        gap: 14,
    },
    imgBox: {
        width: 80,
        height: 80,
        borderRadius: 18,
        backgroundColor: '#e3e5e8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imgBoxActive: { backgroundColor: '#e68515' },
    img: {
        width: 56,
        height: 56,
        resizeMode: 'contain',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    cardTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '800',
        color: '#1f2933',
    },
    cardTitleDim: { color: '#8a8f98' },
    fare: {
        fontSize: 15,
        fontWeight: '600',
        color: '#8a8f98',
    },
    cardAddress: {
        fontSize: 13,
        color: '#8a8f98',
        marginTop: 6,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
    },
    statusText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
        color: '#4b5563',
    },

    advanceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: 24,
        marginTop: 14,
        backgroundColor: colors.primary,
    },
    advanceText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '800',
    },

    chipsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
        flexWrap: 'wrap',
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e1e4e8',
    },
    chipActive: {
        borderColor: colors.primary,
        backgroundColor: '#EAF4FD',
    },
    chipText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1f2933',
    },
    chipTextActive: { color: colors.primary },

    dropdown: {
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e1e4e8',
        marginBottom: 16,
        overflow: 'hidden',
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eceef1',
    },
    dropdownText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1f2933',
    },
});