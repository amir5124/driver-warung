// components/driver/AutobidSettingsModal.tsx
import { colors } from '@/constants/ojek-theme';
import { api } from '@/lib/api-driver';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
    visible: boolean;
    onClose: () => void;
    onSaved?: () => void;
};

const SERVICES: { key: string; label: string }[] = [
    { key: 'ride', label: 'WarJek' },
    { key: 'food', label: 'WarFood' },
    { key: 'send', label: 'WarSend' },
];

export default function AutobidSettingsModal({
    visible,
    onClose,
    onSaved,
}: Props) {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [maxRadius, setMaxRadius] = useState('3');
    const [minFare, setMinFare] = useState('5000');
    const [maxOrders, setMaxOrders] = useState('3');
    const [services, setServices] = useState<string[]>(['ride', 'food', 'send']);

    useEffect(() => {
        if (!visible) return;
        loadConfig();
    }, [visible]);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const config = await api.autobid.get();
            console.log('[AUTOBID-SETTINGS] Load config:', config);

            if (config) {
                setMaxRadius(String(config.max_radius_km ?? 3));
                setMinFare(String(config.min_fare ?? 5000));
                setMaxOrders(String(config.max_orders_per_hour ?? 3));
                setServices(config.services ?? ['ride', 'food', 'send']);
            }
        } catch (err: any) {
            console.warn('[AUTOBID-SETTINGS] Gagal load:', err?.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                is_enabled: true,
                max_radius_km: Number(maxRadius) || 3,
                min_fare: Number(minFare) || 5000,
                max_orders_per_hour: Number(maxOrders) || 3,
                services,
            };

            console.log('[AUTOBID-SETTINGS] Save:', payload);
            await api.autobid.update(payload);
            console.log('[AUTOBID-SETTINGS] ✅ Saved');

            onSaved?.();
            onClose();
        } catch (err: any) {
            console.warn('[AUTOBID-SETTINGS] ❌ Gagal save:', err?.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleService = (key: string) => {
        setServices((prev) =>
            prev.includes(key)
                ? prev.filter((s) => s !== key)
                : [...prev, key]
        );
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={s.backdrop} onPress={onClose} />

            <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
                {/* Header */}
                <View style={s.header}>
                    <Pressable onPress={onClose} hitSlop={10}>
                        <Ionicons
                            name="arrow-back"
                            size={22}
                            color={colors.text}
                        />
                    </Pressable>
                    <Text style={s.headerTitle}>Preferensi Autobid</Text>
                    <View style={{ width: 22 }} />
                </View>

                {loading ? (
                    <View style={s.loadingWrap}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : (
                    <>
                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{ padding: 20 }}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* Radius */}
                            <Text style={s.label}>Radius Maksimal (km)</Text>
                            <Text style={s.hint}>
                                Hanya order dalam radius ini yang diterima
                            </Text>
                            <TextInput
                                style={s.input}
                                value={maxRadius}
                                onChangeText={setMaxRadius}
                                keyboardType="numeric"
                                placeholder="3"
                            />

                            {/* Fare minimum */}
                            <Text style={s.label}>Pendapatan Minimum (Rp)</Text>
                            <Text style={s.hint}>
                                Order di bawah ini akan di-skip
                            </Text>
                            <TextInput
                                style={s.input}
                                value={minFare}
                                onChangeText={setMinFare}
                                keyboardType="numeric"
                                placeholder="5000"
                            />

                            {/* Max order per jam */}
                            <Text style={s.label}>Maks Order per Jam</Text>
                            <Text style={s.hint}>
                                Batas order autobid dalam 1 jam
                            </Text>
                            <TextInput
                                style={s.input}
                                value={maxOrders}
                                onChangeText={setMaxOrders}
                                keyboardType="numeric"
                                placeholder="3"
                            />

                            {/* Services */}
                            <Text style={s.label}>Jenis Layanan</Text>
                            <Text style={s.hint}>
                                Layanan yang diterima otomatis
                            </Text>
                            <View style={s.servicesRow}>
                                {SERVICES.map((svc) => {
                                    const active = services.includes(svc.key);
                                    return (
                                        <Pressable
                                            key={svc.key}
                                            onPress={() => toggleService(svc.key)}
                                            style={[
                                                s.serviceChip,
                                                active && s.serviceChipActive,
                                            ]}
                                        >
                                            <Ionicons
                                                name={
                                                    active
                                                        ? 'checkmark-circle'
                                                        : 'ellipse-outline'
                                                }
                                                size={16}
                                                color={
                                                    active
                                                        ? colors.primary
                                                        : colors.textMuted
                                                }
                                            />
                                            <Text
                                                style={[
                                                    s.serviceText,
                                                    active &&
                                                    s.serviceTextActive,
                                                ]}
                                            >
                                                {svc.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {/* Info */}
                            <View style={s.infoBox}>
                                <Ionicons
                                    name="information-circle-outline"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={s.infoText}>
                                    Autobid hanya menerima order yang
                                    memenuhi semua kriteria di atas. Order
                                    di luar kriteria tetap muncul sebagai
                                    notif biasa.
                                </Text>
                            </View>
                        </ScrollView>

                        {/* Footer */}
                        <View style={s.footer}>
                            <Pressable
                                style={[s.btn, saving && { opacity: 0.6 }]}
                                onPress={handleSave}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={s.btnText}>
                                        Simpan Preferensi
                                    </Text>
                                )}
                            </Pressable>
                        </View>
                    </>
                )}
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: '10%',
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
    },
    loadingWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
        marginTop: 20,
    },
    hint: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: 12,
        fontSize: 16,
        color: colors.text,
    },
    servicesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    serviceChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: '#fff',
    },
    serviceChipActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primarySoft,
    },
    serviceText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },
    serviceTextActive: {
        color: colors.primary,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: colors.primarySoft,
        borderRadius: 10,
        padding: 12,
        marginTop: 24,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: '#374151',
        lineHeight: 18,
    },
    footer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    btn: {
        backgroundColor: colors.primary,
        paddingVertical: 14,
        borderRadius: 999,
        alignItems: 'center',
    },
    btnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 15,
    },
});