// app/(tabs)/pendapatan.tsx
import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import {
    api,
    EarningHistoryItem,
    EarningsSummary,
} from '@/lib/api-driver';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
// WARNA
// ============================================================
const PRIMARY = '#40a3ea';
const SECONDARY = '#e68515';
const DANGER = '#e24c4c';
const PRIMARY_SOFT = '#E8F4FD';
const SECONDARY_SOFT = '#FDF1E2';
const DANGER_SOFT = '#FDEAEA';

// ============================================================
// TYPES & KONSTANTA
// ============================================================
type Period = 'day' | 'week';

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

const PERIOD_TABS: { key: Period; label: string }[] = [
    { key: 'day', label: 'Harian' },
    { key: 'week', label: 'Mingguan' },
];

const PAGE_SIZE = 30;

const TYPE_LABEL: Record<string, string> = {
    ride: 'WarJek',
    send: 'WarSend',
    food: 'WarFood',
};

const IMG_MOTOR = require('@/assets/images/motor.png');
const IMG_MOBIL = require('@/assets/images/mobil.png');

const isCarItem = (i: EarningHistoryItem) => {
    const key = `${i.tariff_code ?? ''} ${i.option_name ?? ''}`.toLowerCase();
    return key.includes('car') || key.includes('mobil');
};

const getItemImage = (i: EarningHistoryItem) =>
    i.type === 'ride' && isCarItem(i) ? IMG_MOBIL : IMG_MOTOR;

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

// ============================================================
// HELPERS
// ============================================================
const formatRupiah = (n: number) =>
    'Rp' + Math.round(n || 0).toLocaleString('id-ID');

const shortAddress = (name?: string | null) => {
    if (!name) return '—';
    return name.split(',')[0].trim();
};

const pad = (n: number) => String(n).padStart(2, '0');

const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfWeek = (d: Date) => {
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const s = startOfDay(d);
    s.setDate(s.getDate() - diff);
    return s;
};

const inPeriod = (iso: string, period: Period) => {
    const t = new Date(iso).getTime();
    const now = new Date();
    const from = period === 'day' ? startOfDay(now) : startOfWeek(now);
    return t >= from.getTime();
};

const dayLabel = (iso: string) => {
    const d = startOfDay(new Date(iso));
    const today = startOfDay(new Date());
    const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'Hari ini';
    if (diffDays === 1) return 'Kemarin';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

// ============================================================
// SCREEN
// ============================================================
export default function PendapatanScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const scrollRef = useRef<ScrollView>(null);
    const riwayatY = useRef(0);

    const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
    const [history, setHistory] = useState<EarningHistoryItem[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [openingId, setOpeningId] = useState<number | null>(null);

    const [period, setPeriod] = useState<Period>('day');
    const [filterPeriod, setFilterPeriod] = useState<Period | null>(null);

    // ============================================================
    // Alert state (pakai AppAlert)
    // ============================================================
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
    ) => {
        setAlertState({ visible: true, title, message, buttons });
    };

    const hideAlert = () => {
        setAlertState((a) => ({ ...a, visible: false }));
    };

    // ============================================================
    // LOAD DATA
    // ============================================================
    const loadAll = useCallback(async () => {
        try {
            const [e, h] = await Promise.all([
                api.drivers.getEarnings(),
                api.drivers.getEarningsHistory(PAGE_SIZE, 0),
            ]);
            setEarnings(e);
            setHistory(h);
            setHasMore(h.length === PAGE_SIZE);
        } catch (err: any) {
            console.warn('[PENDAPATAN] Gagal load:', err?.message);
            showAlert(
                'Gagal memuat pendapatan',
                err?.message ?? 'Coba lagi sebentar.',
                [{ text: 'OK' }]
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [loadAll])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadAll();
    };

    const loadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const next = await api.drivers.getEarningsHistory(
                PAGE_SIZE,
                history.length
            );
            setHistory((prev) => {
                const ids = new Set(prev.map((i) => i.id));
                return [...prev, ...next.filter((i) => !ids.has(i.id))];
            });
            setHasMore(next.length === PAGE_SIZE);
        } catch (err: any) {
            console.warn('[PENDAPATAN] Gagal load more:', err?.message);
        } finally {
            setLoadingMore(false);
        }
    };

    // ============================================================
    // DATA TURUNAN
    // ============================================================
    const periodAmount = earnings
        ? period === 'day'
            ? earnings.today
            : earnings.week
        : 0;

    const periodTrips = useMemo(
        () =>
            history.filter(
                (i) => i.completed_at && inPeriod(i.completed_at, period)
            ).length,
        [history, period]
    );

    const visibleHistory = useMemo(
        () =>
            filterPeriod
                ? history.filter(
                    (i) =>
                        i.completed_at &&
                        inPeriod(i.completed_at, filterPeriod)
                )
                : history,
        [history, filterPeriod]
    );

    const sections = useMemo(() => {
        const map = new Map<string, EarningHistoryItem[]>();
        visibleHistory.forEach((item) => {
            const label = item.completed_at
                ? dayLabel(item.completed_at)
                : 'Lainnya';
            if (!map.has(label)) map.set(label, []);
            map.get(label)!.push(item);
        });
        return Array.from(map.entries()).map(([label, items]) => ({
            label,
            items,
        }));
    }, [visibleHistory]);

    // Wallet info
    const balance = earnings?.balance ?? 0;
    const cashDebt = earnings?.cash_debt ?? 0;
    const netBalance = earnings?.net_balance ?? 0;
    const pendingPayout = earnings?.pending_payout ?? 0;
    const hasDebt = cashDebt > 0;

    // ============================================================
    // HANDLERS
    // ============================================================
    const scrollToRiwayat = () => {
        scrollRef.current?.scrollTo({
            y: Math.max(riwayatY.current - 12, 0),
            animated: true,
        });
    };

    const handleLihatDetail = () => {
        setFilterPeriod(period);
        setTimeout(scrollToRiwayat, 50);
    };

    const handleRiwayatTransaksi = () => {
        setFilterPeriod(null);
        setTimeout(scrollToRiwayat, 50);
    };

    const showInfo = () =>
        showAlert(
            period === 'day'
                ? 'Pendapatan hari ini'
                : 'Pendapatan minggu ini',
            'Total penghasilan kamu dari order yang sudah selesai pada periode ini.',
            [{ text: 'OK' }]
        );

    const showDebtInfo = () =>
        showAlert(
            'Utang Komisi (Tunai)',
            `Kamu punya utang komisi ${formatRupiah(cashDebt)} dari order tunai.\n\n` +
            `Utang ini akan otomatis dipotong dari pendapatan order non-tunai berikutnya.\n\n` +
            `Saldo bersih: ${formatRupiah(netBalance)}`,
            [{ text: 'OK' }]
        );

    // Top Up
    const handleTopUp = () => {
        router.push('/topup');
    };

    // Tarik dengan validasi utang
    const handleWithdraw = () => {
        if (cashDebt > 0) {
            showAlert(
                'Utang Cash Belum Lunas',
                `Kamu masih punya utang komisi ${formatRupiah(cashDebt)}.\n\n` +
                `Lunasi dulu dengan menyelesaikan order non-tunai, atau top up saldo untuk melunasinya.`,
                [
                    { text: 'Top Up', onPress: handleTopUp },
                    { text: 'OK', style: 'cancel' },
                ]
            );
            return;
        }

        if (balance <= 0) {
            showAlert(
                'Saldo Kosong',
                'Kamu belum punya saldo yang bisa ditarik.',
                [{ text: 'OK' }]
            );
            return;
        }

        router.push('/tarik' as any);
    };

    const openOrder = async (item: EarningHistoryItem) => {
        if (openingId) return;
        setOpeningId(item.id);
        try {
            const order = await api.orders.get(Number(item.id));
            router.push({
                pathname: '/order-detail',
                params: { order: JSON.stringify(order) },
            });
        } catch (err: any) {
            showAlert(
                'Gagal membuka order',
                err?.message ?? 'Coba lagi sebentar.',
                [{ text: 'OK' }]
            );
        } finally {
            setOpeningId(null);
        }
    };

    // ============================================================
    // RENDER ITEM RIWAYAT
    // ============================================================
    const renderItem = (item: EarningHistoryItem) => {
        const isRide = item.type === 'ride';
        const typeLabel =
            item.type === 'ride' && isCarItem(item)
                ? 'WarCar'
                : TYPE_LABEL[item.type] ?? item.type;
        const opening = openingId === item.id;

        const isCash = item.settlement_type === 'cash';
        const hasCommission =
            isCash &&
            item.commission_amount != null &&
            item.commission_amount > 0;

        return (
            <Pressable
                key={item.id}
                onPress={() => openOrder(item)}
                style={({ pressed }) => [
                    s.itemCard,
                    pressed && { opacity: 0.85 },
                ]}
            >
                <View
                    style={[
                        s.itemIcon,
                        {
                            backgroundColor: isRide
                                ? PRIMARY_SOFT
                                : SECONDARY_SOFT,
                        },
                    ]}
                >
                    <Image source={getItemImage(item)} style={s.itemImg} />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={s.itemTitle} numberOfLines={1}>
                        {shortAddress(item.dropoff_name)}
                    </Text>
                    <Text style={s.itemSub} numberOfLines={1}>
                        {typeLabel}
                        {item.completed_at
                            ? ` • ${formatTime(item.completed_at)}`
                            : ''}
                        {item.order_code ? ` • ${item.order_code}` : ''}
                    </Text>

                    {item.settlement_type && (
                        <View
                            style={[
                                s.settleBadge,
                                isCash ? s.settleCash : s.settleGateway,
                            ]}
                        >
                            <Text style={s.settleBadgeText}>
                                {isCash ? 'TUNAI' : 'ONLINE'}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                    {opening ? (
                        <ActivityIndicator size="small" color={PRIMARY} />
                    ) : (
                        <Text style={s.itemAmount}>
                            +{formatRupiah(item.driver_earning)}
                        </Text>
                    )}

                    {hasCommission && (
                        <Text style={s.itemCommission}>
                            -{formatRupiah(item.commission_amount!)}
                        </Text>
                    )}
                </View>
            </Pressable>
        );
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <SafeAreaView style={s.container} edges={['top']}>
            <ScrollView
                ref={scrollRef}
                contentContainerStyle={{
                    paddingBottom: insets.bottom + 100,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[PRIMARY]}
                        tintColor={PRIMARY}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* ── Judul ── */}
                <Text style={s.pageTitle}>Pendapatan</Text>

                {/* ── Ringkasan pendapatan ── */}
                <Text style={s.sectionTitle}>Ringkasan pendapatan</Text>

                <View style={s.summaryCard}>
                    <View style={s.periodRow}>
                        {PERIOD_TABS.map((t) => {
                            const active = period === t.key;
                            return (
                                <Pressable
                                    key={t.key}
                                    style={[
                                        s.periodTab,
                                        active && s.periodTabActive,
                                    ]}
                                    onPress={() => setPeriod(t.key)}
                                >
                                    <Text
                                        style={[
                                            s.periodText,
                                            active && s.periodTextActive,
                                        ]}
                                    >
                                        {t.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={s.summaryBody}>
                        <View style={s.labelRow}>
                            <Text style={s.summaryLabel}>
                                {period === 'day'
                                    ? 'Hari ini'
                                    : 'Minggu ini'}
                            </Text>
                            <Pressable onPress={showInfo} hitSlop={8}>
                                <Ionicons
                                    name="information-circle"
                                    size={16}
                                    color="#4b5563"
                                />
                            </Pressable>
                        </View>

                        <View style={s.summaryRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.summaryAmount}>
                                    {formatRupiah(periodAmount)}
                                </Text>
                                <Text style={s.summaryTrips}>
                                    {periodTrips} trip selesai
                                </Text>
                            </View>

                            <Pressable
                                style={({ pressed }) => [
                                    s.detailBtn,
                                    pressed && { opacity: 0.85 },
                                ]}
                                onPress={handleLihatDetail}
                            >
                                <Text style={s.detailBtnText}>
                                    Lihat detail
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>

                {/* ============================================================
                    KARTU SALDO — dengan utang cash + saldo bersih
                ============================================================ */}
                <View style={s.walletCard}>
                    <View style={s.walletTop}>
                        <View style={s.walletCol}>
                            <Text style={s.walletLabel}>
                                Saldo Aktif
                            </Text>
                            <View style={s.walletValueRow}>
                                <View style={s.walletIcon}>
                                    <Ionicons
                                        name="wallet"
                                        size={14}
                                        color="#fff"
                                    />
                                </View>
                                <Text style={s.walletValue}>
                                    {formatRupiah(balance)}
                                </Text>
                            </View>
                        </View>
                        <View style={s.walletCol}>
                            <Text style={s.walletLabel}>Menunggu</Text>
                            <Text style={s.walletValue}>
                                {formatRupiah(pendingPayout)}
                            </Text>
                        </View>
                    </View>

                    {hasDebt && (
                        <>
                            <View style={s.walletDivider} />
                            <Pressable style={s.debtRow} onPress={showDebtInfo}>
                                <View style={s.debtIcon}>
                                    <Ionicons name="alert-circle" size={16} color={DANGER} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.debtLabel}>
                                        Utang Komisi (Tunai)
                                    </Text>
                                    <Text style={s.debtHint}>
                                        Otomatis dipotong dari order non-tunai berikutnya
                                    </Text>
                                </View>
                                <Text style={s.debtValue}>
                                    -{formatRupiah(cashDebt)}
                                </Text>
                            </Pressable>

                            <View style={s.netRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.netLabel}>Saldo bersih (bisa ditarik)</Text>
                                    <Text style={s.netSubLabel}>
                                        Saldo aktif {formatRupiah(balance)} − utang {formatRupiah(cashDebt)}
                                    </Text>
                                </View>
                                <Text style={[s.netValue, netBalance < 0 && { color: DANGER }]}>
                                    {formatRupiah(netBalance)}
                                </Text>
                            </View>
                        </>
                    )}
                    <View style={s.walletDivider} />

                    <View style={s.actionsRow}>
                        <Pressable
                            style={s.actionItem}
                            onPress={handleTopUp}
                        >
                            <View style={s.actionIcon}>
                                <Ionicons
                                    name="add"
                                    size={24}
                                    color={PRIMARY}
                                />
                            </View>
                            <Text style={s.actionText}>Top up</Text>
                        </Pressable>

                        <Pressable
                            style={s.actionItem}
                            onPress={handleWithdraw}
                        >
                            <View style={s.actionIcon}>
                                <Ionicons
                                    name="arrow-down"
                                    size={22}
                                    color={PRIMARY}
                                />
                            </View>
                            <Text style={s.actionText}>
                                Tarik ke bank
                            </Text>
                        </Pressable>

                        <Pressable
                            style={s.actionItem}
                            onPress={handleRiwayatTransaksi}
                        >
                            <View style={s.actionIcon}>
                                <Ionicons
                                    name="receipt"
                                    size={20}
                                    color={PRIMARY}
                                />
                            </View>
                            <Text
                                style={[
                                    s.actionText,
                                    { textAlign: 'center' },
                                ]}
                            >
                                Riwayat
                            </Text>
                        </Pressable>
                    </View>
                </View>

                {/* ── Riwayat pendapatan ── */}
                <View
                    onLayout={(e) => {
                        riwayatY.current = e.nativeEvent.layout.y;
                    }}
                    style={s.riwayatWrap}
                >
                    <View style={s.riwayatHeader}>
                        <View style={s.accentBar} />
                        <Text style={s.riwayatTitle}>
                            Riwayat pendapatan
                        </Text>
                    </View>

                    {!!filterPeriod && (
                        <Pressable
                            style={s.filterChip}
                            onPress={() => setFilterPeriod(null)}
                        >
                            <Text style={s.filterChipText}>
                                {filterPeriod === 'day'
                                    ? 'Hari ini'
                                    : 'Minggu ini'}
                            </Text>
                            <Ionicons
                                name="close"
                                size={16}
                                color={SECONDARY}
                            />
                        </Pressable>
                    )}

                    {!loading && sections.length === 0 ? (
                        <View style={s.emptyWrap}>
                            <View style={s.emptyIcon}>
                                <Ionicons
                                    name="receipt-outline"
                                    size={36}
                                    color="#9aa1ac"
                                />
                            </View>
                            <Text style={s.emptyTitle}>
                                Belum ada pendapatan
                            </Text>
                            <Text style={s.emptyDesc}>
                                {filterPeriod
                                    ? 'Belum ada order selesai pada periode ini.'
                                    : 'Pendapatan dari order yang selesai akan muncul di sini.'}
                            </Text>
                        </View>
                    ) : (
                        sections.map((sec) => (
                            <View key={sec.label}>
                                <Text style={s.dateLabel}>
                                    {sec.label}
                                </Text>
                                {sec.items.map(renderItem)}
                            </View>
                        ))
                    )}

                    {hasMore && !filterPeriod && (
                        <Pressable
                            style={s.moreBtn}
                            onPress={loadMore}
                            disabled={loadingMore}
                        >
                            {loadingMore ? (
                                <ActivityIndicator
                                    size="small"
                                    color={PRIMARY}
                                />
                            ) : (
                                <Text style={s.moreText}>
                                    Muat lebih banyak
                                </Text>
                            )}
                        </Pressable>
                    )}
                </View>
            </ScrollView>

            <LoadingModal visible={loading} />

            {/* ===== AppAlert ===== */}
            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={alertState.buttons}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    pageTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#111827',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
        paddingHorizontal: 20,
        marginBottom: 14,
    },

    // ── Kartu ringkasan ──
    summaryCard: {
        marginHorizontal: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#F3F4F6',
        overflow: 'hidden',
    },
    periodRow: { flexDirection: 'row' },
    periodTab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    periodTabActive: { borderBottomColor: PRIMARY },
    periodText: { fontSize: 15, fontWeight: '700', color: '#9aa1ac' },
    periodTextActive: { color: '#111827' },

    summaryBody: {
        backgroundColor: '#fff',
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#e5e7eb',
    },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    summaryLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginTop: 14,
    },
    summaryAmount: { fontSize: 28, fontWeight: '800', color: '#111827' },
    summaryTrips: { fontSize: 14, color: '#6b7280', marginTop: 10 },
    detailBtn: {
        backgroundColor: PRIMARY,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    detailBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    // ── Kartu saldo ──
    walletCard: {
        marginHorizontal: 20,
        marginTop: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#fff',
        paddingVertical: 18,
        paddingHorizontal: 16,
    },
    walletTop: { flexDirection: 'row', justifyContent: 'space-around' },
    walletCol: { alignItems: 'center', gap: 8 },
    walletLabel: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
    walletValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    walletIcon: {
        width: 22,
        height: 22,
        borderRadius: 6,
        backgroundColor: PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
    },
    walletValue: { fontSize: 17, fontWeight: '800', color: '#111827' },
    walletDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#d1d5db',
        marginVertical: 18,
    },

    // Utang cash
    debtRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: DANGER_SOFT,
        borderRadius: 12,
        padding: 12,
    },
    debtIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    debtLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: DANGER,
    },
    debtHint: {
        fontSize: 11,
        color: '#8a94a6',
        marginTop: 2,
    },
    debtValue: {
        fontSize: 16,
        fontWeight: '800',
        color: DANGER,
    },
    netRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
        paddingHorizontal: 4,
    },
    netLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#4b5563',
    },
    netValue: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1AAD5B',
    },
    netSubLabel: {
        fontSize: 10,
        color: '#8a94a6',
        marginTop: 2,
    },

    actionsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    actionItem: { alignItems: 'center', gap: 10, width: 90 },
    actionIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: PRIMARY_SOFT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: { fontSize: 13, fontWeight: '600', color: '#374151' },

    // ── Riwayat ──
    riwayatWrap: { paddingHorizontal: 20, marginTop: 32 },
    riwayatHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    accentBar: {
        width: 5,
        height: 24,
        borderRadius: 3,
        backgroundColor: SECONDARY,
    },
    riwayatTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        backgroundColor: SECONDARY_SOFT,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 12,
    },
    filterChipText: { fontSize: 13, fontWeight: '700', color: SECONDARY },

    dateLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: '#6b7280',
        marginTop: 8,
        marginBottom: 10,
    },
    itemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
    },
    itemIcon: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemImg: {
        width: 30,
        height: 30,
        resizeMode: 'contain',
    },
    itemTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
    itemSub: { fontSize: 12, color: '#6b7280', marginTop: 3 },
    itemAmount: { fontSize: 15, fontWeight: '800', color: PRIMARY },
    itemCommission: {
        fontSize: 11,
        fontWeight: '700',
        color: DANGER,
        marginTop: 2,
    },

    settleBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 4,
    },
    settleCash: {
        backgroundColor: SECONDARY_SOFT,
    },
    settleGateway: {
        backgroundColor: PRIMARY_SOFT,
    },
    settleBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#374151',
        letterSpacing: 0.3,
    },

    moreBtn: {
        height: 46,
        borderRadius: 23,
        borderWidth: 1.5,
        borderColor: PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
    },
    moreText: { color: PRIMARY, fontWeight: '800', fontSize: 14 },

    // ── Empty ──
    emptyWrap: {
        alignItems: 'center',
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    emptyIcon: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#EDEEF0',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#111827',
        marginBottom: 6,
    },
    emptyDesc: {
        fontSize: 13,
        color: '#8a94a6',
        textAlign: 'center',
        lineHeight: 20,
    },
});