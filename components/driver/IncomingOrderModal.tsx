// components/driver/IncomingOrderModal.tsx
import { colors } from '@/constants/ojek-theme';
import { ORDER_BRAND, type DriverOrder } from '@/types/driver';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
    order: DriverOrder | null;
    visible: boolean;
    durationSec?: number;
    onAccept: (order: DriverOrder) => void;
    onReject: (order: DriverOrder) => void;
    onExpire: (order: DriverOrder) => void;
};

const formatRupiah = (n: number) =>
    `Rp${Math.round(n).toLocaleString('id-ID')}`;

export default function IncomingOrderModal({
    order,
    visible,
    durationSec = 15,
    onAccept,
    onReject,
    onExpire,
}: Props) {
    const insets = useSafeAreaInsets();
    const [remaining, setRemaining] = useState(durationSec);

    const onExpireRef = useRef(onExpire);
    useEffect(() => {
        onExpireRef.current = onExpire;
    }, [onExpire]);

    const orderRef = useRef<DriverOrder | null>(order);
    useEffect(() => {
        orderRef.current = order;
    }, [order]);

    useEffect(() => {
        if (!visible || !order) return;

        setRemaining(durationSec);
        let expired = false;

        const id = setInterval(() => {
            setRemaining((r) => {
                if (r <= 1) {
                    clearInterval(id);
                    return 0;
                }
                return r - 1;
            });
        }, 1000);

        const expireId = setTimeout(() => {
            if (expired) return;
            expired = true;
            const currentOrder = orderRef.current;
            if (currentOrder) {
                onExpireRef.current(currentOrder);
            }
        }, durationSec * 1000);

        return () => {
            clearInterval(id);
            clearTimeout(expireId);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, order?.id, durationSec]);

    if (!order) return null;

    const brand = ORDER_BRAND[order.type];
    const isFood = order.type === 'food';
    const isSend = order.type === 'send';

    // ── Hitung subtotal items food ──
    const itemsSubtotal = isFood
        ? (order.items ?? []).reduce((a, i) => a + i.price * i.qty, 0)
        : 0;

    const totalFare = isFood
        ? order.totalFare ?? itemsSubtotal + (order.deliveryFee ?? 0) + (order.packagingFee ?? 0)
        : order.fare;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
        >
            <View style={s.backdrop}>
                <Animated.View
                    entering={FadeInUp.duration(250)}
                    style={[
                        s.card,
                        { paddingBottom: Math.max(insets.bottom, 16) + 12 },
                    ]}
                >
                    {/* ═══════════════════════════════════════════════
                        HEADER — Brand
                    ═══════════════════════════════════════════════ */}
                    <View style={s.header}>
                        <View style={[s.brandDot, { backgroundColor: brand.color }]} />
                        <Text style={s.brandText}>{brand.label.toLowerCase()}</Text>
                        {!!order.orderCode && (
                            <Text style={s.orderCode}>#{order.orderCode}</Text>
                        )}
                    </View>

                    {/* ═══════════════════════════════════════════════
                        SCROLLABLE CONTENT
                    ═══════════════════════════════════════════════ */}
                    <ScrollView
                        style={{ maxHeight: 460 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* ── Stops (Pickup → Dropoff) ── */}
                        <View style={s.stopsCard}>
                            <View style={s.stopRow}>
                                <View style={[s.dot, { backgroundColor: colors.primary }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.stopName} numberOfLines={1}>
                                        {order.pickup.name}
                                    </Text>
                                    <Text style={s.stopAddr} numberOfLines={2}>
                                        {order.pickup.address}
                                    </Text>
                                    {!!order.pickup.landmark && (
                                        <Text style={s.landmark} numberOfLines={1}>
                                            Patokan: {order.pickup.landmark}
                                        </Text>
                                    )}
                                </View>
                            </View>

                            <View style={s.stopLine} />

                            <View style={s.stopRow}>
                                <View style={[s.dot, { backgroundColor: '#f26b21' }]} />
                                <View style={{ flex: 1 }}>
                                    <Text style={s.stopName} numberOfLines={1}>
                                        {order.dropoff.name}
                                    </Text>
                                    <View style={s.distancePill}>
                                        <Text style={s.distanceText}>
                                            Jarak • {order.distanceKm.toFixed(1)} km
                                        </Text>
                                    </View>
                                    <Text style={s.stopAddr} numberOfLines={2}>
                                        {order.dropoff.address}
                                    </Text>
                                    {!!order.dropoff.landmark && (
                                        <Text style={s.landmark} numberOfLines={1}>
                                            Patokan: {order.dropoff.landmark}
                                        </Text>
                                    )}
                                </View>
                            </View>

                            {!!order.note && (
                                <View style={s.noteBox}>
                                    <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
                                    <Text style={s.noteText} numberOfLines={3}>
                                        {order.note}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* ═══════════════════════════════════════════════
                            KHUSUS FOOD — Rincian Pesanan
                        ═══════════════════════════════════════════════ */}
                        {isFood && order.items && order.items.length > 0 && (
                            <View style={s.itemsCard}>
                                <Text style={s.sectionTitle}>Rincian Pesanan</Text>
                                {order.items.map((item, idx) => (
                                    <View key={idx} style={s.itemRow}>
                                        <Text style={s.itemQty}>{item.qty}×</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.itemName} numberOfLines={1}>
                                                {item.name}
                                            </Text>
                                            {!!item.variant && (
                                                <Text style={s.itemVariant}>{item.variant}</Text>
                                            )}
                                        </View>
                                        <Text style={s.itemPrice}>
                                            {formatRupiah(item.price * item.qty)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* ═══════════════════════════════════════════════
                            KHUSUS SEND — Info Penerima & Paket
                        ═══════════════════════════════════════════════ */}
                        {isSend && (
                            <View style={s.sendCard}>
                                <Text style={s.sectionTitle}>Info Paket</Text>

                                {!!order.receiverName && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Penerima</Text>
                                        <Text style={s.infoValue}>{order.receiverName}</Text>
                                    </View>
                                )}
                                {!!order.receiverPhone && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Telp Penerima</Text>
                                        <Text style={s.infoValue}>{order.receiverPhone}</Text>
                                    </View>
                                )}
                                {!!order.senderName && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Pengirim</Text>
                                        <Text style={s.infoValue}>{order.senderName}</Text>
                                    </View>
                                )}
                                {!!order.senderPhone && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Telp Pengirim</Text>
                                        <Text style={s.infoValue}>{order.senderPhone}</Text>
                                    </View>
                                )}
                                {!!order.packageType && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Jenis</Text>
                                        <Text style={s.infoValue}>{order.packageType}</Text>
                                    </View>
                                )}
                                {!!order.packageSize && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Ukuran</Text>
                                        <Text style={s.infoValue}>{order.packageSize}</Text>
                                    </View>
                                )}
                                {!!order.packageWeight && (
                                    <View style={s.infoRow}>
                                        <Text style={s.infoLabel}>Berat</Text>
                                        <Text style={s.infoValue}>{order.packageWeight}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* ═══════════════════════════════════════════════
                            PRICE — Berbeda per tipe
                        ═══════════════════════════════════════════════ */}
                        <View style={s.priceCard}>
                            {/* FOOD: Subtotal + Ongkir + Total */}
                            {isFood && (
                                <>

                                    <View style={s.priceRow}>
                                        <Text style={s.priceLabel}>Ongkir</Text>
                                        <Text style={s.priceValue}>
                                            {formatRupiah(order.deliveryFee ?? order.fare)}
                                        </Text>
                                    </View>
                                    {(order.packagingFee ?? 0) > 0 && (
                                        <View style={s.priceRow}>
                                            <Text style={s.priceLabel}>Kemasan</Text>
                                            <Text style={s.priceValue}>
                                                {formatRupiah(order.packagingFee!)}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={[s.priceRow, s.priceRowBold]}>
                                        <Text style={s.priceLabelBold}>Total Bayar</Text>
                                        <Text style={s.priceValueBold}>
                                            {formatRupiah(totalFare)}
                                        </Text>
                                    </View>
                                    <View style={[s.priceRow, s.priceRowHighlight]}>
                                        <Text style={s.priceLabelHighlight}>
                                            Pendapatan Kamu
                                        </Text>
                                        <Text style={s.priceValueHighlight}>
                                            {formatRupiah(order.fare)}
                                        </Text>
                                    </View>
                                </>
                            )}

                            {/* RIDE & SEND: Tarif + Pendapatan */}
                            {!isFood && (
                                <>
                                    <View style={s.priceRow}>
                                        <Text style={s.priceLabel}>
                                            {isSend ? 'Ongkir' : 'Tarif'}
                                        </Text>
                                        <Text style={s.priceValue}>
                                            {formatRupiah(order.deliveryFee ?? order.fare)}
                                        </Text>
                                    </View>
                                    {order.paymentMethod === 'cash' && (
                                        <View style={[s.priceRow, s.priceRowHighlight]}>
                                            <Text style={s.priceLabelHighlight}>
                                                Pendapatan Kamu (Tunai)
                                            </Text>
                                            <Text style={s.priceValueHighlight}>
                                                {formatRupiah(order.fare)}
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}

                            <Text style={s.paySub}>
                                Pembayaran • {order.paymentMethod ?? 'cash'}
                            </Text>
                        </View>
                    </ScrollView>

                    {/* ═══════════════════════════════════════════════
                        FOOTER — Terima / Tolak
                    ═══════════════════════════════════════════════ */}
                    <View style={s.footerRow}>
                        <Pressable
                            style={s.rejectBtn}
                            onPress={() => onReject(order)}
                            hitSlop={8}
                        >
                            <Ionicons name="close" size={22} color={colors.danger} />
                        </Pressable>
                        <Pressable
                            style={[s.acceptBtn, { backgroundColor: brand.color }]}
                            onPress={() => onAccept(order)}
                        >
                            <Text style={s.acceptText}>TERIMA</Text>
                            <View style={s.timerCircle}>
                                <Text style={s.timerText}>
                                    {String(remaining).padStart(2, '0')}
                                </Text>
                            </View>
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    card: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: 18,
    },

    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    brandDot: { width: 22, height: 22, borderRadius: 11 },
    brandText: { fontSize: 18, fontWeight: '800', color: colors.text },
    orderCode: {
        marginLeft: 'auto',
        fontSize: 11,
        color: colors.textMuted,
        fontWeight: '600',
    },

    // ── Stops ──
    stopsCard: {
        backgroundColor: colors.field,
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
    },
    stopRow: { flexDirection: 'row', gap: 10 },
    dot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
    stopName: { fontSize: 15, fontWeight: '800', color: colors.text },
    stopAddr: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
        lineHeight: 17,
    },
    landmark: {
        fontSize: 11,
        color: colors.textMuted,
        fontStyle: 'italic',
        marginTop: 2,
    },
    stopLine: {
        width: StyleSheet.hairlineWidth,
        height: 14,
        backgroundColor: colors.border,
        marginLeft: 4,
        marginVertical: 4,
    },
    distancePill: {
        alignSelf: 'flex-start',
        backgroundColor: colors.secondary,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginVertical: 4,
    },
    distanceText: { color: '#fff', fontSize: 11, fontWeight: '800' },

    // ── Note ──
    noteBox: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    noteText: {
        flex: 1,
        fontSize: 12,
        color: colors.textMuted,
        fontStyle: 'italic',
    },

    // ── Section title ──
    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 8,
    },

    // ── Items (Food) ──
    itemsCard: {
        backgroundColor: colors.field,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 6,
        gap: 8,
    },
    itemQty: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.primary,
        minWidth: 26,
    },
    itemName: {
        fontSize: 13,
        color: colors.text,
        fontWeight: '600',
    },
    itemVariant: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 2,
    },
    itemPrice: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },

    // ── Send info ──
    sendCard: {
        backgroundColor: colors.field,
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 5,
        gap: 12,
    },
    infoLabel: {
        fontSize: 12,
        color: colors.textMuted,
        flex: 1,
    },
    infoValue: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.text,
        flex: 1.5,
        textAlign: 'right',
    },

    // ── Price card ──
    priceCard: { marginBottom: 18 },
    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    priceRowBold: {
        borderTopWidth: 1,
        paddingTop: 10,
        marginTop: 4,
    },
    priceRowHighlight: {
        borderTopWidth: 1,
        paddingTop: 10,
        marginTop: 4,
    },
    priceLabel: { fontSize: 13, color: colors.textMuted },
    priceValue: { fontSize: 14, fontWeight: '800', color: colors.text },
    priceLabelBold: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    priceValueBold: {
        fontSize: 15,
        fontWeight: '900',
        color: colors.text,
    },
    priceLabelHighlight: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.primary,
    },
    priceValueHighlight: {
        fontSize: 15,
        fontWeight: '900',
        color: colors.primary,
    },
    paySub: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 10,
        textAlign: 'center',
    },

    // ── Footer ──
    footerRow: { flexDirection: 'row', gap: 12 },
    rejectBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
    },
    acceptBtn: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    acceptText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 16,
        letterSpacing: 0.5,
    },
    timerCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});