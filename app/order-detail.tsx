// app/order-detail.tsx
import { colors } from '@/constants/ojek-theme';
import { api, ExistingCustomerRating, OrderResponse } from '@/lib/api-driver';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Linking,
    Pressable,
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
// KONSTANTA
// ============================================================
const ORANGE = '#e68515';
const WA_SUPPORT = '62812285777';

const TYPE_LABEL: Record<OrderResponse['type'], string> = {
    ride: 'WarJek',
    send: 'WarSend',
    food: 'WarFood',
};

const STATUS_LABEL: Record<OrderResponse['status'], string> = {
    pending: 'Menunggu driver',
    accepted: 'Diterima',
    arrived: 'Tiba di lokasi',
    in_progress: 'Sedang berjalan',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
};

const STATUS_COLOR: Record<OrderResponse['status'], string> = {
    pending: '#f5a623',
    accepted: '#40a3ea',
    arrived: '#1AAD5B',
    in_progress: '#1AAD5B',
    completed: '#1AAD5B',
    cancelled: '#e5484d',
};

const PAYMENT_LABEL: Record<string, string> = {
    cash: 'Tunai',
    wallet: 'Saldo',
    qris: 'QRIS',
    bank_transfer: 'Transfer bank',
};

// ============================================================
// HELPERS
// ============================================================
const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const formatDate = (iso: string) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
};

const formatTime = (iso: string) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

const formatRupiah = (n: number) =>
    'Rp' + Math.round(n || 0).toLocaleString('id-ID');

const shortAddress = (name?: string | null) => {
    if (!name) return '—';
    return name.split(',')[0].trim();
};

const isCarOrder = (o: OrderResponse) => {
    const raw = o as any;
    const key = `${raw.tariff_code ?? ''} ${raw.option_name ?? ''}`.toLowerCase();
    return key.includes('car') || key.includes('mobil');
};

// ============================================================
// MAIN SCREEN
// ============================================================
export default function OrderDetailScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { order: orderParam } = useLocalSearchParams<{ order: string }>();

    // Data awal dari parameter (tampil instan)
    const initial = useMemo(() => {
        try {
            return JSON.parse(orderParam as string) as OrderResponse;
        } catch {
            return null;
        }
    }, [orderParam]);

    const [order, setOrder] = useState<OrderResponse | null>(initial);
    const [myRating, setMyRating] = useState<ExistingCustomerRating | null>(null);

    // Ambil data terbaru (nomor telepon customer, item, timestamp, dll)
    useEffect(() => {
        if (!initial) return;
        let alive = true;
        (async () => {
            try {
                const fresh = await api.orders.get(Number(initial.id));
                if (!alive) return;
                setOrder((prev) => ({
                    ...(prev ?? initial),
                    ...fresh,
                    customer: fresh.customer ?? prev?.customer ?? null,
                }));
            } catch (err: any) {
                console.warn('[ORDER-DETAIL] Gagal refresh order:', err?.message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [initial]);

    // Rating yang driver berikan untuk customer (hanya order selesai)
    useEffect(() => {
        if (!initial || initial.status !== 'completed') return;
        let alive = true;
        (async () => {
            try {
                const r = await api.orders.getRating(Number(initial.id));
                if (alive) setMyRating(r);
            } catch (err: any) {
                console.warn('[ORDER-DETAIL] Gagal ambil rating:', err?.message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [initial]);

    if (!order) {
        return (
            <SafeAreaView style={s.container} edges={['top']}>
                <View style={s.header}>
                    <Pressable onPress={() => router.back()} hitSlop={12}>
                        <Ionicons name="arrow-back" size={26} color="#1f2933" />
                    </Pressable>
                    <Text style={s.headerTitle}>Detail Order</Text>
                </View>
                <View style={s.emptyWrap}>
                    <Ionicons name="alert-circle" size={48} color={colors.textMuted} />
                    <Text style={s.emptyText}>Data pesanan tidak ditemukan.</Text>
                </View>
            </SafeAreaView>
        );
    }

    // ── Flag ──
    const isCancelled = order.status === 'cancelled';
    const isSend = order.type === 'send';
    const isFood = order.type === 'food';
    const isRide = order.type === 'ride';

    const brandName =
        isRide && isCarOrder(order) ? 'WarCar' : TYPE_LABEL[order.type];

    // ── Info customer (pemesan) ──
    const customerName = order.customer?.full_name ?? 'Customer';
    const customerPhone = order.customer?.phone ?? '';
    const customerRating = order.customer?.rating_avg ?? null;
    const customerReviews = order.customer?.total_reviews ?? 0;

    // ── Info pickup / dropoff ──
    const pickupTitle = isSend
        ? order.sender_name ?? 'Pengirim'
        : isFood
            ? shortAddress(order.pickup_name)
            : customerName;
    const pickupPhone = isSend
        ? order.sender_phone ?? ''
        : isRide
            ? customerPhone
            : '';
    const pickupAddress = order.pickup_address ?? order.pickup_name ?? '—';

    const dropTitle = isSend
        ? order.receiver_name ?? 'Penerima'
        : shortAddress(order.dropoff_name);
    const dropPhone = isSend ? order.receiver_phone ?? '' : '';
    const dropAddress = order.dropoff_address ?? order.dropoff_name ?? '—';

    // ── Info paket (WarSend) ──
    const itemType = order.package_type ?? 'Dokumen';
    const itemSize = order.package_size
        ? `${order.package_size}${order.package_weight ? ` (${order.package_weight})` : ''}`
        : 'Kecil (1 - 5 kg)';
    const itemProtection = order.package_protection ?? 'Silver';

    // ── Penghasilan ──
    const driverIncome = order.driver_earning ?? 0;
    const totalFare = order.total_fare ?? 0;

    // ── Timeline ──
    const timeline = [
        { label: 'Pesanan dibuat', time: order.created_at },
        { label: 'Order diterima', time: order.accepted_at },
        { label: 'Tiba di titik jemput', time: order.arrived_at },
        { label: 'Perjalanan dimulai', time: order.started_at },
        { label: 'Order selesai', time: order.completed_at },
        { label: 'Order dibatalkan', time: order.cancelled_at },
    ].filter((t) => !!t.time) as { label: string; time: string }[];

    // ── Handler WA ──
    const openWhatsApp = async (
        phone?: string,
        target: 'customer' | 'support' = 'support'
    ) => {
        let url: string;
        if (target === 'customer' && phone) {
            const clean = phone.replace(/\D/g, '').replace(/^0/, '62');
            const text = `Halo, saya driver ${brandName} untuk order ${order.order_code}.`;
            url = `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
        } else {
            const text =
                `Halo, saya butuh bantuan untuk pesanan ${brandName} ` +
                `dengan kode transaksi ${order.order_code}.`;
            url = `https://wa.me/${WA_SUPPORT}?text=${encodeURIComponent(text)}`;
        }
        try {
            await Linking.openURL(url);
        } catch (err: any) {
            console.warn('[ORDER-DETAIL] Gagal buka WhatsApp:', err?.message);
        }
    };

    return (
        <SafeAreaView style={s.container} edges={['top']}>
            {/* Header */}
            <View style={s.header}>
                <Pressable onPress={() => router.back()} hitSlop={12}>
                    <Ionicons name="arrow-back" size={26} color="#1f2933" />
                </Pressable>
                <Text style={s.headerTitle}>Rangkuman Order</Text>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
            >
                {/* ── Brand + Status ── */}
                <View style={s.section}>
                    <View style={s.rowBetween}>
                        <Text style={s.brand}>{brandName}</Text>
                        <Text style={s.date}>{formatDate(order.created_at)}</Text>
                    </View>
                    <View style={[s.rowBetween, { marginTop: 8 }]}>
                        <View style={s.statusRow}>
                            <View
                                style={[
                                    s.statusDot,
                                    { backgroundColor: STATUS_COLOR[order.status] },
                                ]}
                            />
                            <Text style={s.statusTitle}>
                                {STATUS_LABEL[order.status]}
                            </Text>
                        </View>
                        <Text style={s.code} numberOfLines={1}>
                            {order.order_code}
                        </Text>
                    </View>
                </View>

                <View style={s.divider} />

                {/* ── Route (Pickup + Dropoff) ── */}
                <View style={s.routeWrap}>
                    <View style={s.dotted} />

                    {/* Pickup */}
                    <View style={s.routeRow}>
                        <View style={[s.pin, { backgroundColor: colors.primary }]}>
                            <Ionicons name="arrow-up" size={16} color="#fff" />
                        </View>
                        <View style={s.addrCard}>
                            <Text style={s.caption}>
                                {isSend
                                    ? 'Pengirim'
                                    : isFood
                                        ? 'Ambil di'
                                        : 'Titik Jemput'}
                            </Text>
                            <Text style={s.personName} numberOfLines={2}>
                                {pickupTitle}
                            </Text>
                            {!!pickupPhone && (
                                <Pressable
                                    onPress={() => openWhatsApp(pickupPhone, 'customer')}
                                >
                                    <Text style={s.phone}>{pickupPhone}</Text>
                                </Pressable>
                            )}
                            <Text style={s.address} numberOfLines={3}>
                                {pickupAddress}
                            </Text>
                        </View>
                    </View>

                    {/* Dropoff */}
                    <View style={[s.routeRow, { marginTop: 16 }]}>
                        <View style={[s.pin, { backgroundColor: ORANGE }]}>
                            <Ionicons name="arrow-down" size={16} color="#fff" />
                        </View>
                        <View style={s.addrCard}>
                            <Text style={s.caption}>
                                {isSend ? 'Penerima' : 'Tujuan'}
                            </Text>
                            <Text style={s.personName} numberOfLines={2}>
                                {dropTitle}
                            </Text>
                            {isCancelled && (
                                <View style={s.badge}>
                                    <Text style={s.badgeText}>Dibatalkan</Text>
                                </View>
                            )}
                            {!!dropPhone && (
                                <Pressable
                                    onPress={() => openWhatsApp(dropPhone, 'customer')}
                                >
                                    <Text style={s.phone}>{dropPhone}</Text>
                                </Pressable>
                            )}
                            <Text style={s.address} numberOfLines={3}>
                                {dropAddress}
                            </Text>

                            {/* Meta paket: khusus WarSend */}
                            {isSend && (
                                <>
                                    <View style={s.dashed} />
                                    <View style={s.metaRow}>
                                        <Ionicons name="archive" size={15} color="#4b5563" />
                                        <Text style={s.metaText} numberOfLines={1}>
                                            {itemType}
                                        </Text>
                                        <View style={s.dot} />
                                        <Ionicons
                                            name="shield-checkmark"
                                            size={15}
                                            color="#4b5563"
                                        />
                                        <Text
                                            style={[s.metaText, { flexShrink: 1 }]}
                                            numberOfLines={1}
                                        >
                                            Perlindungan {itemProtection}
                                        </Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                <View style={s.divider} />

                {/* ── Pemesan (untuk WarSend & WarFood; di WarJek sudah jadi titik jemput) ── */}
                {!isRide && (
                    <View style={s.infoCard}>
                        <View style={s.infoLeft}>
                            <Ionicons name="person" size={22} color={colors.primary} />
                            <View>
                                <Text style={s.infoLabel}>Dipesan oleh</Text>
                                <Text style={s.infoSub}>{customerName}</Text>
                            </View>
                        </View>
                        {!!customerPhone && (
                            <Pressable
                                onPress={() => openWhatsApp(customerPhone, 'customer')}
                            >
                                <Text style={s.phoneSmall}>{customerPhone}</Text>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* ── Rating customer ── */}
                {customerRating != null && customerReviews > 0 && (
                    <View style={s.infoCard}>
                        <View style={s.infoLeft}>
                            <Ionicons name="star" size={22} color="#f5a623" />
                            <Text style={s.infoLabel}>Rating customer</Text>
                        </View>
                        <Text style={s.infoValue}>
                            {Number(customerRating).toFixed(1)} • {customerReviews} ulasan
                        </Text>
                    </View>
                )}

                {/* ── Jarak & durasi ── */}
                {(order.distance_km != null || order.duration_min != null) && (
                    <View style={s.infoCard}>
                        <View style={s.infoLeft}>
                            <Ionicons name="navigate" size={22} color={colors.primary} />
                            <Text style={s.infoLabel}>Jarak & durasi</Text>
                        </View>
                        <Text style={s.infoValue}>
                            {order.distance_km != null
                                ? `${Number(order.distance_km).toFixed(1)} km`
                                : '—'}
                            {order.duration_min != null
                                ? ` • ${Math.round(order.duration_min)} menit`
                                : ''}
                        </Text>
                    </View>
                )}

                {/* ── Info Paket (khusus WarSend) ── */}
                {isSend && (
                    <View style={s.infoCard}>
                        <View style={s.infoLeft}>
                            <Ionicons name="scale" size={22} color={colors.primary} />
                            <Text style={s.infoLabel}>Ukuran & berat</Text>
                        </View>
                        <Text style={s.infoValue}>{itemSize}</Text>
                    </View>
                )}

                {/* ── Pembayaran ── */}
                <View style={s.infoCard}>
                    <View style={s.infoLeft}>
                        <Ionicons name="card" size={22} color={colors.primary} />
                        <Text style={s.infoLabel}>Pembayaran</Text>
                    </View>
                    <Text style={s.infoValue}>
                        {PAYMENT_LABEL[order.payment_method] ?? order.payment_method}
                    </Text>
                </View>

                {/* ── Catatan ── */}
                {!!order.notes && (
                    <View style={s.infoCard}>
                        <View style={s.infoLeft}>
                            <Ionicons
                                name="chatbox-ellipses-outline"
                                size={22}
                                color={colors.primary}
                            />
                            <Text style={s.infoLabel}>Catatan</Text>
                        </View>
                        <Text
                            style={[s.infoValue, { flex: 1, textAlign: 'right' }]}
                            numberOfLines={4}
                        >
                            {order.notes}
                        </Text>
                    </View>
                )}

                {/* ── Alasan pembatalan ── */}
                {isCancelled && !!order.cancellation_reason && (
                    <View style={[s.infoCard, { borderColor: '#f5c2c4' }]}>
                        <View style={s.infoLeft}>
                            <Ionicons name="alert-circle" size={22} color="#e5484d" />
                            <Text style={s.infoLabel}>Alasan batal</Text>
                        </View>
                        <Text
                            style={[s.infoValue, { flex: 1, textAlign: 'right' }]}
                            numberOfLines={4}
                        >
                            {order.cancellation_reason}
                        </Text>
                    </View>
                )}

                {/* ── Item (khusus WarFood) ── */}
                {isFood && order.items && order.items.length > 0 && (
                    <View style={s.itemsCard}>
                        <Text style={s.itemsTitle}>Daftar Pesanan</Text>
                        {order.items.map((it, i) => (
                            <View key={i} style={s.itemRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.itemName} numberOfLines={1}>
                                        {it.qty}× {it.name}
                                    </Text>
                                    {!!it.variant && (
                                        <Text style={s.itemVariant}>{it.variant}</Text>
                                    )}
                                </View>
                                <Text style={s.itemPrice}>
                                    {formatRupiah(it.price * it.qty)}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Rating yang kamu berikan ── */}
                {myRating?.rating != null && (
                    <View style={s.infoCard}>
                        <View style={s.infoLeft}>
                            <Ionicons name="thumbs-up" size={22} color={colors.primary} />
                            <View>
                                <Text style={s.infoLabel}>Ulasan kamu</Text>
                                {!!myRating.message && (
                                    <Text style={s.infoSub} numberOfLines={2}>
                                        {myRating.message}
                                    </Text>
                                )}
                            </View>
                        </View>
                        <Text style={s.infoValue}>
                            {'★'.repeat(Math.round(myRating.rating))}
                        </Text>
                    </View>
                )}

                {/* ── Penghasilan ── */}
                <View style={s.incomeCard}>
                    <View style={s.rowBetween}>
                        <View style={s.infoLeft}>
                            <Ionicons name="wallet" size={22} color={colors.primary} />
                            <Text style={s.infoLabel}>Penghasilan Kamu</Text>
                        </View>
                        <Text style={s.incomeValue}>
                            {isCancelled ? 'Rp0' : formatRupiah(driverIncome)}
                        </Text>
                    </View>
                    <View style={s.dashed2} />
                    <View style={s.rowBetween}>
                        <Text style={s.mtText}>Total pesanan</Text>
                        <Text style={s.mtValue}>
                            {isCancelled ? 'Rp0' : formatRupiah(totalFare)}
                        </Text>
                    </View>
                </View>

                {/* ── Riwayat status ── */}
                {timeline.length > 0 && (
                    <View style={s.timelineCard}>
                        <Text style={s.itemsTitle}>Riwayat Status</Text>
                        {timeline.map((t, i) => (
                            <View key={t.label} style={s.timelineRow}>
                                <View style={s.timelineCol}>
                                    <View
                                        style={[
                                            s.timelineDot,
                                            i === timeline.length - 1 && {
                                                backgroundColor: STATUS_COLOR[order.status],
                                            },
                                        ]}
                                    />
                                    {i < timeline.length - 1 && (
                                        <View style={s.timelineLine} />
                                    )}
                                </View>
                                <View style={s.timelineText}>
                                    <Text style={s.timelineLabel}>{t.label}</Text>
                                    <Text style={s.timelineTime}>{formatTime(t.time)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Info Bantuan ── */}
                <View style={s.helpInfo}>
                    <Ionicons
                        name="information-circle-outline"
                        size={18}
                        color="#6b7280"
                    />
                    <Text style={s.helpInfoText}>
                        Butuh bantuan untuk pesanan ini? Tekan tombol di bawah untuk
                        menghubungi support.
                    </Text>
                </View>
            </ScrollView>

            {/* ── Tombol Bantuan ── */}
            <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
                <Pressable
                    style={({ pressed }) => [s.helpBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => openWhatsApp(undefined, 'support')}
                >
                    <Ionicons name="logo-whatsapp" size={22} color={colors.primary} />
                    <Text style={s.helpText}>Bantuan</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e5e7eb',
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#1f2933' },

    // ── Section Brand ──
    section: { paddingHorizontal: 20, paddingVertical: 14 },
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    brand: { fontSize: 24, fontWeight: '800', color: colors.primary },
    date: { fontSize: 15, color: '#6b7280' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusTitle: { fontSize: 16, fontWeight: '800', color: '#1f2933' },
    code: { fontSize: 13, color: '#6b7280', flexShrink: 1 },

    divider: { height: 1, backgroundColor: '#e5e7eb' },

    // ── Route ──
    routeWrap: { padding: 20, position: 'relative' },
    dotted: {
        position: 'absolute',
        left: 34,
        top: 54,
        bottom: 80,
        borderLeftWidth: 2,
        borderLeftColor: '#c9cdd3',
        borderStyle: 'dotted',
    },
    routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    pin: {
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
    },
    addrCard: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e1e4e8',
        borderRadius: 18,
        padding: 16,
        backgroundColor: '#fff',
    },
    caption: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8a8f98',
        marginBottom: 4,
    },
    personName: { fontSize: 18, fontWeight: '800', color: '#1f2933' },
    phone: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.primary,
        marginTop: 8,
        textDecorationLine: 'underline',
    },
    phoneSmall: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.primary,
        textDecorationLine: 'underline',
    },
    address: { fontSize: 14, color: '#6b7280', marginTop: 8 },
    badge: {
        alignSelf: 'flex-start',
        backgroundColor: '#c2510a',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 3,
        marginTop: 8,
    },
    badgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },

    dashed: {
        borderTopWidth: 1,
        borderTopColor: '#d5d8dd',
        borderStyle: 'dashed',
        marginTop: 16,
        marginBottom: 12,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c9cdd3',
        marginHorizontal: 4,
    },

    // ── Info card ──
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 20,
        marginTop: 16,
        padding: 18,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e1e4e8',
        gap: 12,
    },
    infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    infoLabel: { fontSize: 15, fontWeight: '700', color: '#1f2933' },
    infoSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    infoValue: { fontSize: 15, fontWeight: '800', color: '#1f2933' },

    // ── Items (WarFood) ──
    itemsCard: {
        marginHorizontal: 20,
        marginTop: 16,
        padding: 18,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e1e4e8',
    },
    itemsTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1f2933',
        marginBottom: 12,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 12,
    },
    itemName: { fontSize: 14, fontWeight: '700', color: '#1f2933' },
    itemVariant: { fontSize: 12, color: '#8a94a6', marginTop: 2 },
    itemPrice: { fontSize: 14, fontWeight: '800', color: '#1f2933' },

    // ── Income card ──
    incomeCard: {
        marginHorizontal: 20,
        marginTop: 16,
        padding: 18,
        borderRadius: 18,
        backgroundColor: '#F5FBF7',
        borderWidth: 1.5,
        borderColor: '#c8ecd5',
    },
    incomeValue: {
        fontSize: 20,
        fontWeight: '900',
        color: '#1AA260',
    },
    dashed2: {
        borderTopWidth: 1,
        borderTopColor: '#d5d8dd',
        borderStyle: 'dashed',
        marginVertical: 12,
    },
    mtText: { fontSize: 13, color: '#6b7280' },
    mtValue: { fontSize: 14, fontWeight: '700', color: '#4b5563' },

    // ── Timeline ──
    timelineCard: {
        marginHorizontal: 20,
        marginTop: 16,
        padding: 18,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e1e4e8',
    },
    timelineRow: { flexDirection: 'row', gap: 12 },
    timelineCol: { alignItems: 'center', width: 14 },
    timelineDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#c9cdd3',
        marginTop: 3,
    },
    timelineLine: {
        flex: 1,
        width: 2,
        backgroundColor: '#e1e4e8',
        marginVertical: 2,
    },
    timelineText: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 14,
    },
    timelineLabel: { fontSize: 14, fontWeight: '600', color: '#1f2933' },
    timelineTime: { fontSize: 13, color: '#6b7280', fontWeight: '600' },

    // ── Help info ──
    helpInfo: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginHorizontal: 20,
        marginTop: 20,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#F1F3F5',
    },
    helpInfoText: { flex: 1, fontSize: 12, color: '#4b5563', lineHeight: 18 },

    // ── Footer ──
    footer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        paddingHorizontal: 20,
        paddingTop: 16,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: -3 },
        elevation: 12,
    },
    helpBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 56,
        borderRadius: 28,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    helpText: { fontSize: 17, fontWeight: '800', color: colors.primary },

    // ── Empty ──
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
    },
    emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});