// app/edit-services.tsx
import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import { colors } from '@/constants/ojek-theme';
import { api } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 🆕 2 kendaraan saja
type VehicleType = 'motor' | 'mobil';

type ServiceItem = {
    code: string;
    label: string;
    desc: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    requiresVehicle?: VehicleType[];
};

const ALL_SERVICES: ServiceItem[] = [
    // ── WarJek (motor) ──
    {
        code: 'warjek_s',
        label: 'WarJek S',
        desc: 'Ojek motor jarak dekat (< 10 km)',
        icon: 'bicycle',
        color: '#1AAD5B',
        requiresVehicle: ['motor'],
    },
    {
        code: 'warjek_l',
        label: 'WarJek L',
        desc: 'Ojek motor jarak jauh (≥ 10 km)',
        icon: 'bicycle',
        color: '#1AAD5B',
        requiresVehicle: ['motor'],
    },
    // ── WarCar (mobil) ──
    {
        code: 'warcar_s',
        label: 'WarCar S',
        desc: 'Taksi mobil jarak dekat',
        icon: 'car',
        color: '#40a3ea',
        requiresVehicle: ['mobil'],
    },
    {
        code: 'warcar_l',
        label: 'WarCar L',
        desc: 'Taksi mobil jarak jauh',
        icon: 'car',
        color: '#40a3ea',
        requiresVehicle: ['mobil'],
    },
    // ── WarSend (motor) ──
    {
        code: 'warsend_s',
        label: 'WarSend S',
        desc: 'Kirim paket kecil',
        icon: 'cube',
        color: '#e68515',
        requiresVehicle: ['motor'],
    },
    {
        code: 'warsend_l',
        label: 'WarSend L',
        desc: 'Kirim paket besar',
        icon: 'cube',
        color: '#e68515',
        requiresVehicle: ['motor'],
    },
    // ── WarFood (motor) 🆕 ──
    {
        code: 'warfood',        // konsisten dengan tariffs yang sudah difix
        label: 'WarFood',
        desc: 'Antar makanan',
        icon: 'fast-food',
        color: '#e5484d',
        requiresVehicle: ['motor'],   // 🆕 cukup motor
    },
];

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

export default function EditServicesScreen() {
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);

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

    // Load
    useEffect(() => {
        (async () => {
            try {
                const dp = await api.drivers.getMyProfile();
                setSelected(dp.services ?? []);
                const vt = dp.vehicle_type;
                if (vt === 'motor' || vt === 'mobil') {
                    setVehicleType(vt);
                }
            } catch (err: any) {
                console.warn('[EDIT-SERVICES] Gagal load:', err?.message);
                showAlert(
                    'Gagal memuat data',
                    err?.message ?? 'Coba lagi sebentar.',
                    [{ text: 'OK' }]
                );
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const isServiceAvailable = (item: ServiceItem): boolean => {
        if (!item.requiresVehicle) return true;
        if (!vehicleType) return false;
        return item.requiresVehicle.includes(vehicleType);
    };

    const toggleService = (code: string) => {
        setSelected((prev) =>
            prev.includes(code)
                ? prev.filter((c) => c !== code)
                : [...prev, code]
        );
    };

    const handleSave = async () => {
        if (saving) return;

        if (selected.length === 0) {
            showAlert(
                'Pilih minimal 1 layanan',
                'Aktifkan minimal satu layanan untuk bisa menerima orderan.',
                [{ text: 'OK' }]
            );
            return;
        }

        setSaving(true);
        try {
            await api.drivers.updateServices(selected);

            await new Promise((r) =>
                setTimeout(r, Platform.OS === 'ios' ? 300 : 100)
            );

            showAlert('Berhasil', 'Layanan sudah diperbarui.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (err: any) {
            console.warn('[EDIT-SERVICES] Gagal save:', err?.message);
            await new Promise((r) => setTimeout(r, 250));
            showAlert(
                'Gagal menyimpan',
                err?.message ?? 'Coba lagi sebentar.',
                [{ text: 'OK' }]
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={s.container}>
            <View style={[s.header, { paddingTop: insets.top + 12 }]}>
                <Pressable
                    onPress={() => router.back()}
                    style={s.backBtn}
                    hitSlop={8}
                >
                    <Ionicons
                        name="arrow-back"
                        size={24}
                        color="#1f2933"
                    />
                </Pressable>
                <Text style={s.headerTitle}>Layanan</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView
                contentContainerStyle={{
                    padding: 20,
                    paddingBottom: insets.bottom + 100,
                }}
                showsVerticalScrollIndicator={false}
            >
                <Text style={s.sectionDesc}>
                    Pilih layanan yang ingin kamu terima. Customer akan
                    melihat layanan ini saat mencari driver.
                </Text>

                <View style={s.counterRow}>
                    <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.primary}
                    />
                    <Text style={s.counterText}>
                        {selected.length} dari {ALL_SERVICES.length}{' '}
                        layanan dipilih
                    </Text>
                </View>

                <View style={s.serviceList}>
                    {ALL_SERVICES.map((item) => {
                        const available = isServiceAvailable(item);
                        const active = selected.includes(item.code);

                        return (
                            <Pressable
                                key={item.code}
                                onPress={() =>
                                    available &&
                                    toggleService(item.code)
                                }
                                disabled={!available}
                                style={[
                                    s.serviceCard,
                                    active && s.serviceCardActive,
                                    !available && s.serviceCardDisabled,
                                ]}
                            >
                                <View
                                    style={[
                                        s.serviceIcon,
                                        {
                                            backgroundColor: available
                                                ? `${item.color}20`
                                                : '#E5E7EB',
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={item.icon}
                                        size={24}
                                        color={
                                            available
                                                ? item.color
                                                : '#9AA0A6'
                                        }
                                    />
                                </View>

                                <View style={{ flex: 1 }}>
                                    <View style={s.serviceTitleRow}>
                                        <Text
                                            style={[
                                                s.serviceLabel,
                                                !available &&
                                                s.serviceLabelDisabled,
                                            ]}
                                        >
                                            {item.label}
                                        </Text>
                                        {!available && (
                                            <View
                                                style={
                                                    s.unavailableBadge
                                                }
                                            >
                                                <Text
                                                    style={
                                                        s.unavailableText
                                                    }
                                                >
                                                    Perlu kendaraan
                                                    berbeda
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text
                                        style={[
                                            s.serviceDesc,
                                            !available &&
                                            s.serviceDescDisabled,
                                        ]}
                                    >
                                        {item.desc}
                                    </Text>
                                </View>

                                <View
                                    style={[
                                        s.checkbox,
                                        active && s.checkboxActive,
                                        !available &&
                                        s.checkboxDisabled,
                                    ]}
                                >
                                    {active && (
                                        <Ionicons
                                            name="checkmark"
                                            size={16}
                                            color="#fff"
                                        />
                                    )}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>

                <View style={s.infoBox}>
                    <Ionicons
                        name="information-circle"
                        size={18}
                        color={colors.primary}
                    />
                    <Text style={s.infoText}>
                        Layanan yang tidak tersedia karena kendaraan kamu
                        berbeda akan ditampilkan abu-abu. Ubah kendaraan
                        dulu di menu Kendaraan untuk mengaktifkannya.
                    </Text>
                </View>
            </ScrollView>

            <View
                style={[
                    s.footer,
                    { paddingBottom: insets.bottom + 16 },
                ]}
            >
                <Pressable
                    onPress={handleSave}
                    disabled={saving}
                    style={[s.saveBtn, saving && { opacity: 0.7 }]}
                >

                    <Text style={s.saveBtnText}>
                        {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
                    </Text>
                </Pressable>
            </View>

            <LoadingModal visible={loading} />

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
    container: { flex: 1, backgroundColor: '#fff' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e5e9f0',
    },
    backBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#1f2933',
    },

    sectionDesc: {
        fontSize: 13,
        color: '#8a94a6',
        lineHeight: 19,
        marginBottom: 16,
    },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 16,
    },
    counterText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },

    serviceList: { gap: 10 },
    serviceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#e5e9f0',
        backgroundColor: '#fff',
    },
    serviceCardActive: {
        borderColor: colors.primary,
        backgroundColor: '#EAF4FD',
    },
    serviceCardDisabled: {
        backgroundColor: '#F9FAFB',
        opacity: 0.7,
    },
    serviceIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    serviceLabel: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1f2933',
    },
    serviceLabelDisabled: { color: '#9AA0A6' },
    serviceDesc: {
        fontSize: 12,
        color: '#8a94a6',
        marginTop: 2,
    },
    serviceDescDisabled: { color: '#C4C8CF' },
    unavailableBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        backgroundColor: '#FEF3C7',
    },
    unavailableText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#92400E',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },
    checkboxDisabled: {
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },

    infoBox: {
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#EAF4FD',
        marginTop: 20,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: '#2b86c9',
        lineHeight: 18,
    },

    footer: {
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#e5e9f0',
        backgroundColor: '#fff',
    },
    saveBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 54,
        borderRadius: 27,
        backgroundColor: colors.primary,
    },
    saveBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
});