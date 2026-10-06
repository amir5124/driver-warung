// app/(auth)/register.tsx
import { api, saveToken } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/push';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ImageSourcePropType,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ============================================================
// ASSET ICON KENDARAAN
// ============================================================
const ICON_MOTOR = require('../../assets/images/motor.png');
const ICON_MOBIL = require('../../assets/images/mobil.png');

const TERMS_URL = 'https://waruung.id/privacy.html';

// ============================================================
// THEME
// ============================================================
const COLORS = {
    primary: '#40a3ea',
    primaryDark: '#2b8ed6',
    primarySoft: '#EAF5FD',
    primaryBorder: '#BFE0F8',
    secondary: '#e68515',
    secondarySoft: '#FFF7E6',
    secondaryBorder: '#FFE0A3',
    bg: '#ffffff',
    card: '#f7f9fb',
    border: '#e5e9f0',
    textDark: '#1f2933',
    textMuted: '#8a94a6',
    placeholder: '#a9b1bd',
};

// ============================================================
// 2 Kendaraan saja
// ============================================================
type VehicleType = 'motor' | 'mobil';

const VEHICLE_OPTIONS: { value: VehicleType; label: string; image: ImageSourcePropType }[] = [
    { value: 'motor', label: 'Motor', image: ICON_MOTOR },
    { value: 'mobil', label: 'Mobil', image: ICON_MOBIL },
];

// ============================================================
// Layanan
// ============================================================
type ServiceCode =
    | 'warjek_s'
    | 'warjek_l'
    | 'warcar_s'
    | 'warcar_l'
    | 'warsend_s'
    | 'warsend_l'
    | 'warfood';

type ServiceItem = {
    code: ServiceCode;
    label: string;
    desc: string;
    image: ImageSourcePropType;
    requires: VehicleType | 'any';
};

const SERVICES: ServiceItem[] = [
    {
        code: 'warjek_s',
        label: 'WarJek S',
        desc: 'Ojek motor jarak dekat',
        image: ICON_MOTOR,
        requires: 'motor',
    },
    {
        code: 'warjek_l',
        label: 'WarJek L',
        desc: 'Ojek motor jarak jauh',
        image: ICON_MOTOR,
        requires: 'motor',
    },
    {
        code: 'warcar_s',
        label: 'WarCar S',
        desc: 'Taksi mobil jarak dekat',
        image: ICON_MOBIL,
        requires: 'mobil',
    },
    {
        code: 'warcar_l',
        label: 'WarCar L',
        desc: 'Taksi mobil jarak jauh',
        image: ICON_MOBIL,
        requires: 'mobil',
    },
    {
        code: 'warsend_s',
        label: 'WarSend S',
        desc: 'Kirim paket kecil',
        image: ICON_MOTOR,
        requires: 'motor',
    },
    {
        code: 'warsend_l',
        label: 'WarSend L',
        desc: 'Kirim paket besar',
        image: ICON_MOTOR,
        requires: 'motor',
    },
    {
        code: 'warfood',
        label: 'WarFood',
        desc: 'Antar makanan',
        image: ICON_MOTOR,
        requires: 'motor',
    },
];

export default function DriverRegisterScreen() {
    // Data akun
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [agree, setAgree] = useState(false);

    // Data kendaraan
    const [vehicleType, setVehicleType] = useState<VehicleType>('motor');
    const [vehicleBrand, setVehicleBrand] = useState('');
    const [vehicleModel, setVehicleModel] = useState('');
    const [plateNumber, setPlateNumber] = useState('');

    // Layanan
    const [selectedServices, setSelectedServices] = useState<ServiceCode[]>([]);

    // UI
    const [loading, setLoading] = useState(false);
    const [errorModalVisible, setErrorModalVisible] = useState(false);
    const [errorTitle, setErrorTitle] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const openTerms = async () => {
        try {
            await Linking.openURL(TERMS_URL);
        } catch {
            showErrorModal(
                'Tidak Bisa Membuka Halaman',
                'Coba lagi nanti atau buka ' + TERMS_URL + ' lewat browser.'
            );
        }
    };

    const showErrorModal = (title: string, message: string) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setTimeout(
            () => setErrorModalVisible(true),
            Platform.OS === 'ios' ? 400 : 0
        );
    };

    // ============================================================
    // Filter layanan berdasarkan kendaraan
    // ============================================================
    const availableServices = useMemo(() => {
        return SERVICES.filter((s) => {
            if (s.requires === 'any') return true;
            return s.requires === vehicleType;
        });
    }, [vehicleType]);

    // Auto-remove service yang tidak valid saat ganti kendaraan
    React.useEffect(() => {
        setSelectedServices((prev) =>
            prev.filter((code) =>
                availableServices.some((s) => s.code === code)
            )
        );
    }, [availableServices]);

    const toggleService = (code: ServiceCode) => {
        setSelectedServices((prev) =>
            prev.includes(code)
                ? prev.filter((c) => c !== code)
                : [...prev, code]
        );
    };

    // ============================================================
    // Sign up
    // ============================================================
    const handleSignUp = async () => {
        if (!agree) {
            showErrorModal(
                'Belum Disetujui',
                'Kamu harus menyetujui Syarat & Ketentuan dulu.'
            );
            return;
        }
        if (!name.trim() || !email.trim() || !password.trim()) {
            showErrorModal(
                'Data Belum Lengkap',
                'Nama, email, dan kata sandi wajib diisi.'
            );
            return;
        }
        if (password.length < 6) {
            showErrorModal(
                'Kata Sandi Terlalu Pendek',
                'Kata sandi minimal 6 karakter.'
            );
            return;
        }
        if (!vehicleBrand.trim() || !plateNumber.trim()) {
            showErrorModal(
                'Data Kendaraan Belum Lengkap',
                'Merek kendaraan dan plat nomor wajib diisi.'
            );
            return;
        }
        if (selectedServices.length === 0) {
            showErrorModal(
                'Pilih Minimal 1 Layanan',
                'Pilih layanan yang bisa kamu terima.'
            );
            return;
        }

        setLoading(true);
        console.log('[DRIVER-REGISTER] Mulai daftar:', email.trim().toLowerCase());

        try {
            // 1. Register
            const res = await api.register({
                email: email.trim().toLowerCase(),
                password,
                full_name: name.trim(),
                role: 'driver',
            });

            console.log('[DRIVER-REGISTER] Akun dibuat:', {
                userId: res.userId,
                role: res.role,
            });

            // 2. Simpan token
            await saveToken(res.token);

            // 3. Update nomor HP
            if (phone.trim()) {
                try {
                    await api.updateProfile({ phone: phone.trim() });
                } catch (err: any) {
                    console.warn('[DRIVER-REGISTER] Gagal simpan HP:', err.message);
                }
            }

            // 4. Update kendaraan
            try {
                await api.drivers.updateVehicle({
                    vehicle_type: vehicleType,
                    vehicle_brand: vehicleBrand.trim(),
                    vehicle_model: vehicleModel.trim() || undefined,
                    plate_number: plateNumber.trim().toUpperCase(),
                });
                console.log('[DRIVER-REGISTER] Kendaraan tersimpan');
            } catch (err: any) {
                console.warn('[DRIVER-REGISTER] Gagal simpan kendaraan:', err.message);
            }

            // 5. Set layanan
            try {
                await api.drivers.updateServices(selectedServices);
                console.log('[DRIVER-REGISTER] Layanan tersimpan:', selectedServices);
            } catch (err: any) {
                console.warn('[DRIVER-REGISTER] Gagal simpan layanan:', err.message);
            }

            // 6. Set status OFFLINE (belum verified)
            try {
                await api.drivers.setStatus('offline');
            } catch (err: any) {
                console.warn('[DRIVER-REGISTER] Gagal set offline:', err.message);
            }

            // 7. Cache profil + register push notif
            try {
                const profile = await api.me();
                await AsyncStorage.setItem('profile', JSON.stringify(profile));

                const pushToken = await registerForPushNotifications();
                if (pushToken) {
                    const updated = await api.me();
                    await AsyncStorage.setItem(
                        'profile',
                        JSON.stringify(updated)
                    );
                }
            } catch (postErr: any) {
                console.warn(
                    '[DRIVER-REGISTER] Post-register gagal:',
                    postErr?.message
                );
            }

            // 8. Redirect ke tabs — home akan tampil banner "belum verified"
            console.log('[DRIVER-REGISTER] Sukses, redirect ke tabs');
            router.replace('/(tabs)' as any);
        } catch (err: any) {
            console.error('[DRIVER-REGISTER] Gagal:', err.message);
            showErrorModal(
                'Gagal Daftar',
                err.message || 'Terjadi kesalahan, coba lagi.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

            <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            style={styles.backBtn}
                            disabled={loading}
                        >
                            <Ionicons
                                name="arrow-back"
                                size={22}
                                color={COLORS.textDark}
                            />
                        </TouchableOpacity>
                        <Text style={styles.title}>Daftar Jadi Mitra</Text>
                        <Text style={styles.subtitle}>
                            Lengkapi data di bawah untuk mulai terima orderan
                        </Text>
                    </View>

                    {/* ===== DATA AKUN ===== */}
                    <Text style={styles.sectionTitle}>Data Akun</Text>

                    <View style={styles.field}>
                        <Text style={styles.label}>Nama Lengkap</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Nama kamu"
                            placeholderTextColor={COLORS.placeholder}
                            value={name}
                            onChangeText={setName}
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Nomor HP</Text>
                        <View style={styles.phoneWrapper}>
                            <View style={styles.phonePrefix}>
                                <Text style={styles.phonePrefixText}>+62</Text>
                            </View>
                            <View style={styles.phoneDivider} />
                            <TextInput
                                style={styles.phoneInput}
                                placeholder="81234567890"
                                placeholderTextColor={COLORS.placeholder}
                                keyboardType="phone-pad"
                                value={phone}
                                onChangeText={setPhone}
                                editable={!loading}
                            />
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="contoh@gmail.com"
                            placeholderTextColor={COLORS.placeholder}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={email}
                            onChangeText={setEmail}
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Kata Sandi</Text>
                        <View style={styles.passwordWrapper}>
                            <TextInput
                                style={styles.passwordInput}
                                placeholder="Buat kata sandi (min. 6 karakter)"
                                placeholderTextColor={COLORS.placeholder}
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                editable={!loading}
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword((v) => !v)}
                            >
                                <Ionicons
                                    name={
                                        showPassword
                                            ? 'eye-outline'
                                            : 'eye-off-outline'
                                    }
                                    size={20}
                                    color={COLORS.textMuted}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ===== DATA KENDARAAN ===== */}
                    <Text style={styles.sectionTitle}>Data Kendaraan</Text>

                    <View style={styles.field}>
                        <Text style={styles.label}>Jenis Kendaraan</Text>
                        <View style={styles.vehicleRow}>
                            {VEHICLE_OPTIONS.map((v) => {
                                const active = vehicleType === v.value;
                                return (
                                    <TouchableOpacity
                                        key={v.value}
                                        activeOpacity={0.8}
                                        style={[
                                            styles.vehicleOption,
                                            active && styles.vehicleOptionActive,
                                        ]}
                                        onPress={() => setVehicleType(v.value)}
                                        disabled={loading}
                                    >
                                        {active && (
                                            <View style={styles.vehicleCheck}>
                                                <Ionicons
                                                    name="checkmark"
                                                    size={12}
                                                    color="#fff"
                                                />
                                            </View>
                                        )}
                                        <Image
                                            source={v.image}
                                            style={styles.vehicleImage}
                                            resizeMode="contain"
                                        />
                                        <Text
                                            style={[
                                                styles.vehicleOptionText,
                                                active &&
                                                styles.vehicleOptionTextActive,
                                            ]}
                                        >
                                            {v.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Merek Kendaraan</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Honda, Yamaha, Toyota, dll"
                            placeholderTextColor={COLORS.placeholder}
                            value={vehicleBrand}
                            onChangeText={setVehicleBrand}
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Model (opsional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Beat, Vario, Avanza, dll"
                            placeholderTextColor={COLORS.placeholder}
                            value={vehicleModel}
                            onChangeText={setVehicleModel}
                            editable={!loading}
                        />
                    </View>

                    <View style={styles.field}>
                        <Text style={styles.label}>Plat Nomor</Text>
                        <TextInput
                            style={[styles.input, styles.plateInput]}
                            placeholder="H 1234 ABC"
                            placeholderTextColor={COLORS.placeholder}
                            autoCapitalize="characters"
                            value={plateNumber}
                            onChangeText={setPlateNumber}
                            editable={!loading}
                            maxLength={12}
                        />
                    </View>

                    {/* ===== LAYANAN ===== */}
                    <Text style={styles.sectionTitle}>
                        Layanan yang Bisa Diterima
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                        Pilih layanan yang sesuai dengan kendaraanmu (min. 1)
                    </Text>

                    <View style={styles.servicesWrap}>
                        {availableServices.map((srv) => {
                            const active = selectedServices.includes(srv.code);
                            return (
                                <TouchableOpacity
                                    key={srv.code}
                                    activeOpacity={0.8}
                                    style={[
                                        styles.serviceItem,
                                        active && styles.serviceItemActive,
                                    ]}
                                    onPress={() => toggleService(srv.code)}
                                    disabled={loading}
                                >
                                    <View
                                        style={[
                                            styles.serviceIcon,
                                            active && styles.serviceIconActive,
                                        ]}
                                    >
                                        <Image
                                            source={srv.image}
                                            style={styles.serviceImage}
                                            resizeMode="contain"
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text
                                            style={[
                                                styles.serviceLabel,
                                                active && styles.serviceLabelActive,
                                            ]}
                                        >
                                            {srv.label}
                                        </Text>
                                        <Text style={styles.serviceDesc}>
                                            {srv.desc}
                                        </Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.checkbox,
                                            active && styles.checkboxChecked,
                                        ]}
                                    >
                                        {active && (
                                            <Ionicons
                                                name="checkmark"
                                                size={14}
                                                color="#fff"
                                            />
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Checkbox S&K */}
                    <TouchableOpacity
                        style={styles.agreeRow}
                        activeOpacity={0.8}
                        onPress={() => setAgree((v) => !v)}
                        disabled={loading}
                    >
                        <View
                            style={[
                                styles.checkbox,
                                agree && styles.checkboxChecked,
                            ]}
                        >
                            {agree && (
                                <Ionicons
                                    name="checkmark"
                                    size={14}
                                    color="#fff"
                                />
                            )}
                        </View>
                        <Text style={styles.agreeText}>
                            Saya setuju dengan{' '}
                            <Text style={styles.footerLink} onPress={openTerms}>
                                Syarat & Ketentuan
                            </Text>{' '}
                            sebagai mitra driver Waruung
                        </Text>
                    </TouchableOpacity>

                    {/* Info verifikasi */}
                    <View style={styles.infoBox}>
                        <Ionicons
                            name="information-circle"
                            size={18}
                            color={COLORS.secondary}
                        />
                        <Text style={styles.infoText}>
                            Setelah daftar, kamu perlu{' '}
                            <Text style={{ fontWeight: '800' }}>
                                verifikasi akun
                            </Text>{' '}
                            dengan upload dokumen (KTP, SIM, STNK). Kamu baru
                            bisa online setelah diverifikasi.
                        </Text>
                    </View>

                    {/* Tombol Daftar */}
                    <TouchableOpacity
                        style={[
                            styles.primaryButton,
                            (!agree || loading) && styles.primaryButtonDisabled,
                        ]}
                        activeOpacity={0.85}
                        onPress={handleSignUp}
                        disabled={!agree || loading}
                    >
                        <Text style={styles.primaryButtonText}>
                            Daftar Jadi Mitra
                        </Text>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Sudah punya akun? </Text>
                        <TouchableOpacity
                            onPress={() => router.push('/login' as any)}
                        >
                            <Text style={styles.footerLink}>Masuk</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Loading Modal */}
            <Modal
                animationType="fade"
                transparent
                visible={loading}
                onRequestClose={() => { }}
            >
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                    </View>
                </View>
            </Modal>

            {/* Error Modal */}
            <Modal
                visible={errorModalVisible}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setErrorModalVisible(false)}
            >
                <View style={styles.sheetOverlay}>
                    <TouchableWithoutFeedback
                        onPress={() => setErrorModalVisible(false)}
                    >
                        <View style={{ flex: 1 }} />
                    </TouchableWithoutFeedback>

                    <View style={styles.sheetContainer}>
                        <TouchableOpacity
                            onPress={() => setErrorModalVisible(false)}
                            style={styles.sheetCloseButton}
                        >
                            <Ionicons name="close" size={24} color="#1c1c1c" />
                        </TouchableOpacity>

                        <Text style={styles.sheetTitle}>{errorTitle}</Text>
                        <Text style={styles.sheetDescription}>
                            {errorMessage}
                        </Text>

                        <TouchableOpacity
                            onPress={() => setErrorModalVisible(false)}
                            style={styles.sheetButton}
                        >
                            <Text style={styles.sheetButtonText}>Mengerti</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 40,
    },
    header: { marginBottom: 24 },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: -8,
        marginBottom: 8,
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
        color: COLORS.textDark,
        marginBottom: 6,
    },
    subtitle: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },

    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: COLORS.textDark,
        marginTop: 16,
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 13,
        color: COLORS.textMuted,
        marginBottom: 12,
    },

    field: { marginBottom: 16 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.textDark,
        marginBottom: 8,
    },
    input: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: COLORS.textDark,
    },
    plateInput: {
        letterSpacing: 2,
        fontWeight: '700',
        textTransform: 'uppercase',
    },

    phoneWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    phonePrefix: { paddingVertical: 12 },
    phonePrefixText: {
        fontSize: 14,
        color: COLORS.textDark,
        fontWeight: '600',
    },
    phoneDivider: {
        width: 1,
        height: 20,
        backgroundColor: COLORS.border,
        marginHorizontal: 10,
    },
    phoneInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14,
        color: COLORS.textDark,
    },

    passwordWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    passwordInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14,
        color: COLORS.textDark,
    },

    // Pilihan kendaraan (pakai gambar PNG, jadi tidak diberi warna isi penuh)
    vehicleRow: {
        flexDirection: 'row',
        gap: 10,
    },
    vehicleOption: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    vehicleOptionActive: {
        backgroundColor: COLORS.primarySoft,
        borderColor: COLORS.primary,
    },
    vehicleImage: {
        width: 56,
        height: 56,
    },
    vehicleCheck: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    vehicleOptionText: {
        fontSize: 13,
        fontWeight: '700',
        color: COLORS.textDark,
    },
    vehicleOptionTextActive: {
        color: COLORS.primaryDark,
    },

    // Layanan
    servicesWrap: {
        marginBottom: 16,
        gap: 8,
    },
    serviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
    },
    serviceItemActive: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primarySoft,
    },
    serviceIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceIconActive: {
        borderColor: COLORS.primaryBorder,
    },
    serviceImage: {
        width: 32,
        height: 32,
    },
    serviceLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textDark,
    },
    serviceLabelActive: {
        color: COLORS.primaryDark,
    },
    serviceDesc: {
        fontSize: 12,
        color: COLORS.textMuted,
        marginTop: 2,
    },

    agreeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    checkboxChecked: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    agreeText: {
        fontSize: 13,
        color: COLORS.textMuted,
        flexShrink: 1,
        marginLeft: 10,
    },

    // Info verifikasi
    infoBox: {
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: COLORS.secondarySoft,
        borderWidth: 1,
        borderColor: COLORS.secondaryBorder,
        marginBottom: 16,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: '#8a5a0c',
        lineHeight: 18,
    },

    primaryButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 30,
        paddingVertical: 15,
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: COLORS.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    primaryButtonDisabled: { opacity: 0.5 },
    primaryButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '700',
    },

    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    footerText: { fontSize: 13, color: COLORS.textMuted },
    footerLink: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

    loadingOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        width: 80,
        height: 80,
        backgroundColor: '#fff',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },

    sheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 32,
        paddingBottom: 50,
        width: '100%',
        position: 'relative',
    },
    sheetCloseButton: {
        position: 'absolute',
        right: 24,
        top: -64,
        backgroundColor: '#fff',
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
        elevation: 5,
    },
    sheetTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.textDark,
        marginBottom: 10,
    },
    sheetDescription: {
        fontSize: 15,
        color: '#555555',
        lineHeight: 22,
        marginBottom: 32,
    },
    sheetButton: {
        width: '100%',
        borderRadius: 100,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: COLORS.primary,
    },
    sheetButtonText: {
        color: COLORS.primary,
        fontWeight: '700',
        fontSize: 16,
    },
});