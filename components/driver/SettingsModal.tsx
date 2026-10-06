// components/driver/SettingsModal.tsx
import { colors } from '@/constants/ojek-theme';
import { api } from '@/lib/api-driver';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import AutobidSettingsModal from './AutobidSettingsModal';

type Props = {
    visible: boolean;
    onClose: () => void;
    points: number;
    performancePct: number;
    completedToday: number;
    totalToday: number;
    isOnline: boolean;
    onToggleOnline: (next: boolean) => void;
};

// const CASH_OPTIONS = ['50rb', '100rb', '200rb'];   // ⏸️ disabled dulu

export default function SettingsModal({
    visible,
    onClose,
    points,
    performancePct,
    completedToday,
    totalToday,
    isOnline,
    onToggleOnline,
}: Props) {
    // ============================================================
    // STATE — Autobid (dari backend)
    // ============================================================
    const [autobid, setAutobid] = useState(false);
    const [autobidLoading, setAutobidLoading] = useState(false);
    const [autobidSaving, setAutobidSaving] = useState(false);
    const [showAutobidSettings, setShowAutobidSettings] = useState(false);

    // ============================================================
    // STATE — Uang tunai (local) — ⏸️ disabled dulu
    // ============================================================
    // const [cashCap, setCashCap] = useState<string | 'semua'>('semua');

    // ============================================================
    // LOAD AUTOBID CONFIG
    // ============================================================
    const loadAutobidConfig = useCallback(async () => {
        console.log('[SETTINGS-MODAL] Load autobid config...');
        setAutobidLoading(true);

        try {
            const config = await api.autobid.get();
            console.log('[SETTINGS-MODAL] Config autobid:', config);

            if (config) {
                setAutobid(config.is_enabled ?? false);
            }
        } catch (err: any) {
            console.warn(
                '[SETTINGS-MODAL] Gagal load autobid:',
                err?.message
            );
        } finally {
            setAutobidLoading(false);
        }
    }, []);

    useEffect(() => {
        if (visible) {
            loadAutobidConfig();
        }
    }, [visible, loadAutobidConfig]);

    // ============================================================
    // TOGGLE ONLINE / OFFLINE
    // ============================================================
    const handleStatusToggle = () => {
        const next = !isOnline;
        console.log('[SETTINGS-MODAL] Toggle online →', next);

        onClose();
        onToggleOnline(next);
    };

    // ============================================================
    // TOGGLE AUTOBID
    // ============================================================
    const handleAutobidToggle = async () => {
        const next = !autobid;
        console.log('[SETTINGS-MODAL] Toggle autobid →', next);

        setAutobid(next);
        setAutobidSaving(true);

        try {
            await api.autobid.update({ is_enabled: next });
            console.log('[SETTINGS-MODAL] ✅ Autobid saved:', next);
        } catch (err: any) {
            console.warn(
                '[SETTINGS-MODAL] ❌ Gagal save autobid:',
                err?.message
            );
            setAutobid(!next);
        } finally {
            setAutobidSaving(false);
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={s.backdrop} onPress={onClose} />

            <Animated.View
                entering={FadeInUp.duration(200)}
                style={s.card}
            >
                {/* ═══════════════════════════════════════════════
                    STATUS ONLINE / OFFLINE
                ═══════════════════════════════════════════════ */}
                <Pressable
                    style={s.statusRow}
                    onPress={handleStatusToggle}
                >
                    <View
                        style={[
                            s.statusDot,
                            {
                                backgroundColor: isOnline
                                    ? colors.primary
                                    : '#c9ccd1',
                            },
                        ]}
                    />
                    <Text style={s.statusText}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>
                    <Ionicons
                        name={
                            isOnline
                                ? 'radio-button-on'
                                : 'radio-button-off'
                        }
                        size={20}
                        color={
                            isOnline
                                ? colors.primary
                                : colors.textMuted
                        }
                    />
                </Pressable>

                {/* ═══════════════════════════════════════════════
                    STATS
                ═══════════════════════════════════════════════ */}
                <View style={s.statsRow}>

                    <View>
                        <Text style={s.statsLabel}>
                            Performa hari ini
                        </Text>
                        <View style={s.statsValueRow}>
                            <Ionicons
                                name="trending-up"
                                size={16}
                                color="#8E44AD"
                            />
                            <Text style={s.statsValue}>
                                {performancePct}%
                            </Text>
                        </View>
                    </View>
                </View>
                <Text style={s.statsSub}>
                    {completedToday} dari {totalToday} order selesai
                </Text>

                <View style={s.divider} />

                {/* ═══════════════════════════════════════════════
                    AUTOBID
                ═══════════════════════════════════════════════ */}
                <View style={s.rowBetween}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle}>Autobid</Text>
                        <Text style={[s.rowSub, { marginTop: 4 }]}>
                            Otomatis terima order baru
                        </Text>
                    </View>

                    {autobidLoading || autobidSaving ? (
                        <ActivityIndicator
                            size="small"
                            color={colors.primary}
                        />
                    ) : (
                        <Pressable
                            onPress={handleAutobidToggle}
                            style={[
                                s.toggle,
                                autobid && s.toggleActive,
                            ]}
                        >
                            <View
                                style={[
                                    s.toggleKnob,
                                    autobid && s.toggleKnobActive,
                                ]}
                            />
                        </Pressable>
                    )}
                </View>

                {/* ✅ Tombol "Atur Preferensi" — muncul kalau autobid ON */}
                {autobid && !autobidLoading && (
                    <Pressable
                        style={s.autobidSettingsBtn}
                        onPress={() => {
                            console.log(
                                '[SETTINGS-MODAL] Buka autobid settings'
                            );
                            setShowAutobidSettings(true);
                        }}
                    >
                        <Ionicons
                            name="options-outline"
                            size={18}
                            color={colors.primary}
                        />
                        <Text style={s.autobidSettingsText}>
                            Atur Preferensi Autobid
                        </Text>
                        <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={colors.primary}
                        />
                    </Pressable>
                )}

                <View style={s.divider} />

                {/* ═══════════════════════════════════════════════
                    ⏸️ ORDER SEARAH — disabled dulu
                ═══════════════════════════════════════════════ */}
                {/*
                <View style={s.rowBetween}>
                    <View>
                        <Text style={s.rowTitle}>Order searah</Text>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                marginTop: 4,
                            }}
                        >
                            <Text style={s.rowSub}>
                                Kuota harian:
                            </Text>
                            <View style={s.quotaBadge}>
                                <Text style={s.quotaText}>1</Text>
                            </View>
                        </View>
                    </View>
                    <Pressable style={s.pilBtn}>
                        <Text style={s.pilBtnText}>
                            Pilih tujuan
                        </Text>
                    </Pressable>
                </View>

                <View style={s.divider} />
                */}

                {/* ═══════════════════════════════════════════════
                    ⏸️ UANG TUNAI MAKS — disabled dulu
                ═══════════════════════════════════════════════ */}
                {/*
                <Text style={s.rowTitle}>
                    Uang tunai maks. saat ini
                </Text>
                <View style={s.cashRow}>
                    {CASH_OPTIONS.map((c) => (
                        <Pressable
                            key={c}
                            onPress={() => {
                                console.log(
                                    '[SETTINGS-MODAL] Cash cap →',
                                    c
                                );
                                setCashCap(c);
                            }}
                            style={[
                                s.cashPill,
                                cashCap === c && s.cashPillActive,
                            ]}
                        >
                            <Text
                                style={[
                                    s.cashPillText,
                                    cashCap === c &&
                                        s.cashPillTextActive,
                                ]}
                            >
                                {c}
                            </Text>
                        </Pressable>
                    ))}
                    <Pressable
                        onPress={() => {
                            console.log(
                                '[SETTINGS-MODAL] Cash cap → semua'
                            );
                            setCashCap('semua');
                        }}
                        style={[
                            s.cashPillSolid,
                            cashCap === 'semua' &&
                                s.cashPillSolidActive,
                        ]}
                    >
                        <Text style={s.cashPillSolidText}>
                            semua
                        </Text>
                    </Pressable>
                </View>
                */}

                {/* ═══════════════════════════════════════════════
                    CLOSE
                ═══════════════════════════════════════════════ */}
                <Pressable style={s.closeBtn} onPress={onClose}>
                    <Ionicons
                        name="close"
                        size={22}
                        color={colors.text}
                    />
                </Pressable>
            </Animated.View>

            {/* ═══════════════════════════════════════════════
                AUTOBID SETTINGS MODAL
            ═══════════════════════════════════════════════ */}
            <AutobidSettingsModal
                visible={showAutobidSettings}
                onClose={() => setShowAutobidSettings(false)}
                onSaved={loadAutobidConfig}
            />
        </Modal>
    );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    card: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '18%',
        backgroundColor: '#fff',
        marginHorizontal: 0,
        borderRadius: 0,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 28,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 18,
        paddingVertical: 8,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    statusText: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },

    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    statsLabel: { fontSize: 13, color: colors.textMuted },
    statsValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    statsValue: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    statsSub: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 10,
        paddingHorizontal: 4,
    },

    divider: {
        height: 8,
        backgroundColor: colors.field,
        marginVertical: 16,
        marginHorizontal: -20,
    },

    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    rowTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    rowSub: { fontSize: 13, color: colors.textMuted },

    // ⏸️ Style untuk order searah (disabled, tapi tetap ada)
    quotaBadge: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 1,
    },
    quotaText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
    },
    pilBtn: {
        borderWidth: 1.5,
        borderColor: colors.primary,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    pilBtnText: {
        color: colors.primary,
        fontWeight: '800',
        fontSize: 13,
    },

    toggle: {
        width: 46,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#E5E8EC',
        padding: 3,
        justifyContent: 'center',
    },
    toggleActive: { backgroundColor: colors.primary },
    toggleKnob: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#fff',
    },
    toggleKnobActive: { alignSelf: 'flex-end' },

    // ✅ Tombol "Atur Preferensi Autobid"
    autobidSettingsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: colors.primarySoft,
        marginTop: 12,
    },
    autobidSettingsText: {
        flex: 1,
        color: colors.primary,
        fontWeight: '700',
        fontSize: 13,
    },

    // ⏸️ Style cash cap (disabled, tapi tetap ada)
    cashRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        alignItems: 'center',
    },
    cashPill: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    cashPillActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySoft,
    },
    cashPillText: {
        fontSize: 13,
        color: colors.text,
        fontWeight: '700',
    },
    cashPillTextActive: { color: colors.primary },
    cashPillSolid: {
        flex: 1,
        backgroundColor: '#c9ccd1',
        borderRadius: 20,
        paddingVertical: 10,
        alignItems: 'center',
    },
    cashPillSolidActive: { backgroundColor: colors.primary },
    cashPillSolidText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 13,
    },

    closeBtn: {
        alignSelf: 'center',
        marginTop: 22,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.field,
        alignItems: 'center',
        justifyContent: 'center',
    },
});