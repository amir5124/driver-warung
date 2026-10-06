// app/edit-vehicle.tsx
import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import { colors } from '@/constants/ojek-theme';
import { api } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 🆕 Kendaraan: 2 tipe saja
type VehicleType = 'motor' | 'mobil';

const VEHICLE_OPTIONS: {
    key: VehicleType;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    desc: string;
}[] = [
        {
            key: 'motor',
            label: 'Motor',
            icon: 'bicycle',
            desc: 'Untuk WarJek, WarSend, dan WarFood',
        },
        {
            key: 'mobil',
            label: 'Mobil',
            icon: 'car',
            desc: 'Untuk WarCar',
        },
    ];

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

export default function EditVehicleScreen() {
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [vehicleType, setVehicleType] = useState<VehicleType>('motor');
    const [vehicleBrand, setVehicleBrand] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [simNumber, setSimNumber] = useState('');
    const [ktpNumber, setKtpNumber] = useState('');

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
                const vt = dp.vehicle_type;
                if (vt === 'motor' || vt === 'mobil') {
                    setVehicleType(vt);
                }
                setVehicleBrand(dp.vehicle_brand ?? '');
                setVehicleModel(dp.vehicle_model ?? '');
                setPlateNumber(dp.plate_number ?? '');
                setSimNumber(dp.sim_number ?? '');
                setKtpNumber(dp.ktp_number ?? '');
            } catch (err: any) {
                console.warn('[EDIT-VEHICLE] Gagal load:', err?.message);
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

    // Save
    const handleSave = async () => {
        if (saving) return;

        setSaving(true);
        try {
            await api.drivers.updateVehicle({
                vehicle_type: vehicleType,
                vehicle_brand: vehicleBrand.trim() || undefined,
                vehicle_model: vehicleModel.trim() || undefined,
                plate_number: plateNumber.trim() || undefined,
                sim_number: simNumber.trim() || undefined,
                ktp_number: ktpNumber.trim() || undefined,
            });

            await new Promise((r) =>
                setTimeout(r, Platform.OS === 'ios' ? 300 : 100)
            );

            showAlert('Berhasil', 'Data kendaraan sudah disimpan.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (err: any) {
            console.warn('[EDIT-VEHICLE] Gagal save:', err?.message);
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
                <Text style={s.headerTitle}>Kendaraan</Text>
                <View style={{ width: 36 }} />
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior="height"
            >
                <ScrollView
                    contentContainerStyle={{
                        padding: 20,
                        paddingBottom: insets.bottom + 100,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    <Text style={s.sectionLabel}>Jenis Kendaraan</Text>
                    <View style={s.vehicleOptions}>
                        {VEHICLE_OPTIONS.map((opt) => {
                            const active = vehicleType === opt.key;
                            return (
                                <Pressable
                                    key={opt.key}
                                    onPress={() => setVehicleType(opt.key)}
                                    style={[
                                        s.vehicleCard,
                                        active && s.vehicleCardActive,
                                    ]}
                                >
                                    <View
                                        style={[
                                            s.vehicleIcon,
                                            active && s.vehicleIconActive,
                                        ]}
                                    >
                                        <Ionicons
                                            name={opt.icon}
                                            size={24}
                                            color={
                                                active
                                                    ? '#fff'
                                                    : colors.primary
                                            }
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text
                                            style={[
                                                s.vehicleLabel,
                                                active &&
                                                s.vehicleLabelActive,
                                            ]}
                                        >
                                            {opt.label}
                                        </Text>
                                        <Text style={s.vehicleDesc}>
                                            {opt.desc}
                                        </Text>
                                    </View>
                                    {active && (
                                        <Ionicons
                                            name="checkmark-circle"
                                            size={22}
                                            color={colors.primary}
                                        />
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={[s.sectionLabel, { marginTop: 24 }]}>
                        Data Kendaraan
                    </Text>

                    <FormField
                        label="Merek"
                        placeholder="Honda, Yamaha, Toyota"
                        value={vehicleBrand}
                        onChangeText={setVehicleBrand}
                        icon="car-sport-outline"
                    />

                    <FormField
                        label="Model"
                        placeholder="Beat, Vario, Avanza"
                        value={vehicleModel}
                        onChangeText={setVehicleModel}
                        icon="information-circle-outline"
                    />

                    <FormField
                        label="Plat Nomor"
                        placeholder="P 1234 ABC"
                        value={plateNumber}
                        onChangeText={(t) => setPlateNumber(t.toUpperCase())}
                        icon="card-outline"
                        autoCapitalize="characters"
                    />

                    <Text style={[s.sectionLabel, { marginTop: 24 }]}>
                        Dokumen
                    </Text>

                    <FormField
                        label="Nomor SIM"
                        placeholder="Nomor SIM kamu"
                        value={simNumber}
                        onChangeText={setSimNumber}
                        icon="card-outline"
                        keyboardType="numeric"
                    />

                    <FormField
                        label="Nomor KTP"
                        placeholder="Nomor KTP kamu"
                        value={ktpNumber}
                        onChangeText={setKtpNumber}
                        icon="card-outline"
                        keyboardType="numeric"
                    />

                    <View style={s.infoBox}>
                        <Ionicons
                            name="information-circle"
                            size={18}
                            color={colors.primary}
                        />
                        <Text style={s.infoText}>
                            Pastikan data kendaraan sesuai dengan dokumen
                            resmi. Data ini akan ditampilkan ke customer
                            saat kamu menerima orderan.
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
            </KeyboardAvoidingView>

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

function FormField({
    label,
    placeholder,
    value,
    onChangeText,
    icon,
    keyboardType,
    autoCapitalize,
}: {
    label: string;
    placeholder: string;
    value: string;
    onChangeText: (t: string) => void;
    icon: keyof typeof Ionicons.glyphMap;
    keyboardType?: 'default' | 'numeric' | 'phone-pad';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
    return (
        <View style={s.field}>
            <Text style={s.fieldLabel}>{label}</Text>
            <View style={s.inputWrap}>
                <Ionicons
                    name={icon}
                    size={20}
                    color={colors.textMuted}
                />
                <TextInput
                    style={s.input}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textMuted}
                    value={value}
                    onChangeText={onChangeText}
                    keyboardType={keyboardType}
                    autoCapitalize={autoCapitalize}
                />
            </View>
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

    sectionLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: '#8a94a6',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginBottom: 12,
    },

    vehicleOptions: { gap: 10 },
    vehicleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: '#e5e9f0',
        backgroundColor: '#fff',
    },
    vehicleCardActive: {
        borderColor: colors.primary,
        backgroundColor: '#EAF4FD',
    },
    vehicleIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#EAF4FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    vehicleIconActive: { backgroundColor: colors.primary },
    vehicleLabel: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1f2933',
    },
    vehicleLabelActive: { color: colors.primary },
    vehicleDesc: { fontSize: 12, color: '#8a94a6', marginTop: 2 },

    field: { marginBottom: 16 },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1f2933',
        marginBottom: 8,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e9f0',
        backgroundColor: '#F9FAFB',
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: '#1f2933',
        padding: 0,
    },

    infoBox: {
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#EAF4FD',
        marginTop: 24,
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