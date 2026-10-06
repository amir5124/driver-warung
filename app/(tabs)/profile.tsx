import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import { api, clearToken, DriverProfile } from '@/lib/api';
import { authState } from '@/lib/authState';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Image,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
    primary: '#40a3ea',
    primaryDark: '#2b86c9',
    primarySoft: '#e8f4fd',
    secondary: '#e68515',
    bg: '#f4f7f9',
    card: '#ffffff',
    border: '#e5e9f0',
    textDark: '#1f2933',
    textMuted: '#8a94a6',
    danger: '#e24c4c',
    dangerSoft: '#FDE9E9',
};

type ProfileCache = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    avatar_url: string | null;
};

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

type DriverStatus = 'online' | 'offline' | 'busy';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Modal iOS butuh jeda sebelum modal lain boleh tampil
const modalDelay = () => sleep(Platform.OS === 'ios' ? 500 : 200);

export default function ProfileScreen() {
    const insets = useSafeAreaInsets();

    const [profile, setProfile] = useState<ProfileCache | null>(null);
    const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [localAvatar, setLocalAvatar] = useState<string | null>(null);

    const [statusModalVisible, setStatusModalVisible] = useState(false);
    const [avatarModalVisible, setAvatarModalVisible] = useState(false);

    // ============================================================
    // AppAlert
    // ============================================================
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
        buttons?: AlertButton[];
    }>({ visible: false, title: '', message: '', buttons: undefined });

    const showAlert = (title: string, message: string, buttons?: AlertButton[]) =>
        setAlertState({ visible: true, title, message, buttons });

    const hideAlert = () => setAlertState((a) => ({ ...a, visible: false }));

    // ============================================================
    // Load data
    // ============================================================
    const loadData = useCallback(async () => {
        try {
            const raw = await AsyncStorage.getItem('profile');
            if (raw) setProfile(JSON.parse(raw));

            const [freshProfile, freshDriver] = await Promise.all([
                api.me(),
                api.drivers.getMyProfile(),
            ]);

            setProfile(freshProfile);
            setDriverProfile(freshDriver);
            await AsyncStorage.setItem('profile', JSON.stringify(freshProfile));
        } catch (err: any) {
            console.warn('[PROFILE] Gagal load:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    // ============================================================
    // Foto profil
    // ============================================================
    const uploadAvatar = async (asset: ImagePicker.ImagePickerAsset) => {
        setLocalAvatar(asset.uri);
        setAvatarUploading(true);
        try {
            const res = await api.uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
            if (profile) {
                const next = { ...profile, avatar_url: res.avatar_url };
                setProfile(next);
                await AsyncStorage.setItem('profile', JSON.stringify(next));
            }
            setLocalAvatar(null);
        } catch (err: any) {
            setLocalAvatar(null);
            setAvatarUploading(false);
            await sleep(250);
            showAlert('Gagal mengunggah foto', err?.message ?? 'Coba lagi beberapa saat.');
        } finally {
            setAvatarUploading(false);
        }
    };

    const pickAvatar = async (source: 'camera' | 'gallery') => {
        setAvatarModalVisible(false);
        await modalDelay();

        try {
            if (source === 'camera') {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    showAlert(
                        'Izin kamera diperlukan',
                        'Aktifkan izin kamera di pengaturan untuk mengambil foto.',
                        [
                            { text: 'Batal', style: 'cancel' },
                            { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
                        ]
                    );
                    return;
                }
            }

            const options: ImagePicker.ImagePickerOptions = {
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
            };

            const result =
                source === 'camera'
                    ? await ImagePicker.launchCameraAsync(options)
                    : await ImagePicker.launchImageLibraryAsync(options);

            if (result.canceled || !result.assets?.[0]) return;
            await uploadAvatar(result.assets[0]);
        } catch (err: any) {
            console.warn('[PROFILE] Gagal pilih foto:', err?.message);
            showAlert('Gagal', 'Tidak dapat membuka kamera atau galeri.');
        }
    };

    // ============================================================
    // Status driver
    // ============================================================
    const setDriverStatus = async (next: DriverStatus) => {
        if (statusUpdating) return;

        // Tutup sheet dulu, baru tampilkan LoadingModal
        setStatusModalVisible(false);
        await modalDelay();

        setStatusUpdating(true);
        try {
            await api.drivers.setStatus(next);
            setDriverProfile((prev) => (prev ? { ...prev, status: next } : prev));
            setStatusUpdating(false);
        } catch (err: any) {
            console.warn('[PROFILE] Gagal update status:', err.message);
            setStatusUpdating(false);
            await sleep(250);
            showAlert('Gagal ubah status', err?.message ?? 'Coba lagi.');
        }
    };

    const handleLogout = async () => {
        // 🆕 Set flag DULU supaya semua fetch dibatalkan
        authState.setLoggingOut(true);

        setLoggingOut(true);
        try {
            if (driverProfile?.status === 'online') {
                await api.drivers.setStatus('offline').catch(() => { });
            }
            await clearToken();
            await AsyncStorage.removeItem('profile');
        } finally {
            setLoggingOut(false);
            router.replace('/(auth)/login' as any);

            // 🆕 Reset flag setelah redirect
            setTimeout(() => authState.setLoggingOut(false), 500);
        }
    };

    const confirmLogout = () =>
        showAlert(
            'Keluar dari akun?',
            'Kamu akan berhenti menerima orderan dan perlu login ulang.',
            [
                { text: 'Batal', style: 'cancel' },
                { text: 'Ya, keluar', style: 'destructive', onPress: handleLogout },
            ]
        );

    // ============================================================
    // Helpers
    // ============================================================
    const initials = (profile?.full_name ?? 'Driver')
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');

    const statusLabel: Record<string, string> = {
        online: 'Online',
        offline: 'Offline',
        busy: 'Sibuk',
    };

    const statusColor: Record<string, string> = {
        online: COLORS.primary,
        offline: COLORS.textMuted,
        busy: COLORS.secondary,
    };

    const vehicleLabel: Record<string, string> = {
        motor: 'Motor',
        mobil: 'Mobil',
    };

    const serviceLabel: Record<string, string> = {
        warjek_s: 'WarJek S',
        warjek_l: 'WarJek L',
        warcar_s: 'WarCar S',
        warcar_l: 'WarCar L',
        warsend_s: 'WarSend S',
        warsend_l: 'WarSend L',
        warfood: 'WarFood',   // 🆕 konsisten
        food: 'WarFood',      // 🆕 fallback (kalau masih ada data lama)
    };

    const formatPhone = (phone: string | null) => {
        if (!phone) return '—';
        const digits = phone.replace(/\D/g, '');
        if (digits.startsWith('62')) return `+${digits}`;
        if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
        return `+62${digits}`;
    };

    const status: DriverStatus = (driverProfile?.status as DriverStatus) ?? 'offline';
    const avatarUri = localAvatar ?? profile?.avatar_url ?? null;
    const services = driverProfile?.services ?? [];

    // ============================================================
    // Loading awal
    // ============================================================
    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
                <LoadingModal visible />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
            <StatusBar barStyle="light-content" />

            <ScrollView
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[COLORS.primary]}
                        tintColor="#fff"
                        progressViewOffset={insets.top}
                    />
                }
            >
                {/* ===== HEADER ===== */}
                <View style={[s.header, { paddingTop: insets.top + 20 }]}>
                    <View style={s.headerCircleA} />
                    <View style={s.headerCircleB} />

                    <TouchableOpacity
                        style={s.avatarWrap}
                        activeOpacity={0.85}
                        onPress={() => setAvatarModalVisible(true)}
                        disabled={avatarUploading}
                    >
                        {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={s.avatar} />
                        ) : (
                            <View style={[s.avatar, s.avatarFallback]}>
                                <Text style={s.avatarText}>{initials}</Text>
                            </View>
                        )}

                        <View style={[s.statusDot, { backgroundColor: statusColor[status] }]} />

                        <View style={s.cameraBadge}>
                            <Ionicons name="camera" size={14} color="#fff" />
                        </View>
                    </TouchableOpacity>

                    <Text style={s.name} numberOfLines={1}>
                        {profile?.full_name ?? 'Driver'}
                    </Text>
                    <Text style={s.email} numberOfLines={1}>
                        {profile?.email ?? '—'}
                    </Text>

                    <View style={s.verifyPill}>
                        <Ionicons
                            name={driverProfile?.is_verified ? 'shield-checkmark' : 'shield-outline'}
                            size={13}
                            color="#fff"
                        />
                        <Text style={s.verifyPillText}>
                            {driverProfile?.is_verified ? 'Terverifikasi' : 'Belum terverifikasi'}
                        </Text>
                    </View>
                </View>

                {/* ===== STATS (menumpuk di header) ===== */}
                <View style={s.statsCard}>
                    <View style={s.statItem}>
                        <View style={s.statIconRow}>
                            <Ionicons name="star" size={16} color="#f5a623" />

                            <Text style={s.statValue}>
                                {driverProfile?.rating_avg != null
                                    ? Number(driverProfile.rating_avg).toFixed(1)
                                    : '—'}
                            </Text>
                        </View>
                        <Text style={s.statLabel}>Rating</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statItem}>
                        <Text style={s.statValue}>{driverProfile?.total_trips ?? 0}</Text>
                        <Text style={s.statLabel}>Perjalanan</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.statItem}>
                        <View style={s.statIconRow}>
                            <View
                                style={[s.miniDot, { backgroundColor: statusColor[status] }]}
                            />
                            <Text style={[s.statValue, { color: statusColor[status] }]}>
                                {statusLabel[status]}
                            </Text>
                        </View>
                        <Text style={s.statLabel}>Status</Text>
                    </View>
                </View>

                {/* ===== STATUS KERJA ===== */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Status Kerja</Text>

                    <TouchableOpacity
                        style={[
                            s.statusCard,
                            { borderColor: `${statusColor[status]}55`, backgroundColor: `${statusColor[status]}12` },
                        ]}
                        onPress={() => setStatusModalVisible(true)}
                        activeOpacity={0.85}
                    >
                        <View style={[s.statusIconWrap, { backgroundColor: `${statusColor[status]}25` }]}>
                            <Ionicons
                                name={
                                    status === 'online'
                                        ? 'radio-button-on'
                                        : status === 'busy'
                                            ? 'time'
                                            : 'radio-button-off'
                                }
                                size={22}
                                color={statusColor[status]}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.statusText}>{statusLabel[status]}</Text>
                            <Text style={s.statusSub}>
                                {status === 'online'
                                    ? 'Kamu bisa menerima orderan'
                                    : status === 'busy'
                                        ? 'Kamu sedang sibuk'
                                        : 'Aktifkan untuk terima orderan'}
                            </Text>
                        </View>
                        <View style={s.changePill}>
                            <Text style={s.changePillText}>Ubah</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* ===== KENDARAAN ===== */}
                <View style={s.card}>
                    <View style={s.cardHeaderRow}>
                        <Text style={[s.cardTitle, { marginBottom: 0 }]}>Kendaraan</Text>
                        <TouchableOpacity
                            onPress={() => router.push('/edit-vehicle' as any)}
                            style={s.editPill}
                        >
                            <Ionicons name="pencil" size={12} color={COLORS.primary} />
                            <Text style={s.editPillText}>Edit</Text>
                        </TouchableOpacity>
                    </View>

                    <InfoRow
                        icon={
                            driverProfile?.vehicle_type === 'mobil'
                                ? 'car-outline'
                                : 'bicycle-outline'
                        }
                        label="Jenis"
                        value={vehicleLabel[driverProfile?.vehicle_type ?? 'motor'] ?? '—'}
                    />
                    <View style={s.rowDivider} />
                    <InfoRow
                        icon="car-sport-outline"
                        label="Merek & Model"
                        value={
                            [driverProfile?.vehicle_brand, driverProfile?.vehicle_model]
                                .filter(Boolean)
                                .join(' ') || '—'
                        }
                    />
                    <View style={s.rowDivider} />
                    <InfoRow
                        icon="card-outline"
                        label="Plat Nomor"
                        value={driverProfile?.plate_number ?? '—'}
                        spaced
                    />
                </View>

                {/* ===== LAYANAN ===== */}
                <View style={s.card}>
                    <View style={s.cardHeaderRow}>
                        <Text style={[s.cardTitle, { marginBottom: 0 }]}>Layanan Diterima</Text>
                        <TouchableOpacity
                            onPress={() => router.push('/edit-services' as any)}
                            style={s.editPill}
                        >
                            <Ionicons name="pencil" size={12} color={COLORS.primary} />
                            <Text style={s.editPillText}>Edit</Text>
                        </TouchableOpacity>
                    </View>

                    {services.length === 0 ? (
                        <View style={s.emptyBox}>
                            <Ionicons name="layers-outline" size={20} color={COLORS.textMuted} />
                            <Text style={s.empty}>Belum ada layanan dipilih</Text>
                        </View>
                    ) : (
                        <View style={s.servicesWrap}>
                            {services.map((code) => (
                                <View key={code} style={s.serviceChip}>
                                    <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                                    <Text style={s.serviceChipText}>{serviceLabel[code] ?? code}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* ===== DATA DIRI ===== */}
                <View style={s.card}>
                    <Text style={s.cardTitle}>Data Diri</Text>

                    <InfoRow icon="mail-outline" label="Email" value={profile?.email ?? '—'} />
                    <View style={s.rowDivider} />
                    <InfoRow
                        icon="call-outline"
                        label="Nomor HP"
                        value={formatPhone(profile?.phone ?? null)}
                    />

                    <TouchableOpacity
                        style={s.editProfileBtn}
                        onPress={() => router.push('/edit-profile' as any)}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                        <Text style={s.editProfileText}>Edit Profil</Text>
                    </TouchableOpacity>
                </View>

                {/* ===== MENU ===== */}
                <View style={s.menuWrap}>
                    <MenuItem
                        icon="shield-checkmark-outline"
                        label="Verifikasi Akun"
                        badge={driverProfile?.is_verified ? 'Terverifikasi' : 'Belum'}
                        badgeColor={driverProfile?.is_verified ? COLORS.primary : COLORS.secondary}
                        onPress={() => router.push('/verification' as any)}
                    />
                    <MenuItem
                        icon="help-circle-outline"
                        label="Bantuan & FAQ"
                        onPress={() => { }}
                    />
                    <MenuItem
                        icon="document-text-outline"
                        label="Syarat & Ketentuan"
                        onPress={() => { }}
                    />
                    <MenuItem
                        icon="log-out-outline"
                        label="Keluar"
                        danger
                        last
                        onPress={confirmLogout}
                    />
                </View>

                <Text style={s.version}>Waruung Driver v1.0.0</Text>
            </ScrollView>

            {/* ===== SHEET FOTO PROFIL ===== */}
            <Modal
                visible={avatarModalVisible}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setAvatarModalVisible(false)}
            >
                <View style={s.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setAvatarModalVisible(false)}>
                        <View style={{ flex: 1 }} />
                    </TouchableWithoutFeedback>

                    <View style={[s.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
                        <View style={s.sheetHandle} />
                        <Text style={s.modalTitle}>Foto Profil</Text>
                        <Text style={s.modalSub}>Pilih sumber foto untuk profilmu</Text>

                        <StatusOption
                            active={false}
                            color={COLORS.primary}
                            icon="camera-outline"
                            label="Ambil Foto"
                            desc="Gunakan kamera sekarang"
                            onPress={() => pickAvatar('camera')}
                        />
                        <StatusOption
                            active={false}
                            color={COLORS.secondary}
                            icon="images-outline"
                            label="Pilih dari Galeri"
                            desc="Ambil foto yang sudah ada"
                            onPress={() => pickAvatar('gallery')}
                        />
                    </View>
                </View>
            </Modal>

            {/* ===== SHEET STATUS ===== */}
            <Modal
                visible={statusModalVisible}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setStatusModalVisible(false)}
            >
                <View style={s.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setStatusModalVisible(false)}>
                        <View style={{ flex: 1 }} />
                    </TouchableWithoutFeedback>

                    <View style={[s.modalSheet, { paddingBottom: insets.bottom + 24 }]}>
                        <View style={s.sheetHandle} />
                        <Text style={s.modalTitle}>Pilih Status Kerja</Text>
                        <Text style={s.modalSub}>
                            Status akan mempengaruhi orderan yang kamu terima
                        </Text>

                        <StatusOption
                            active={status === 'online'}
                            color={COLORS.primary}
                            icon="radio-button-on"
                            label="Online"
                            desc="Siap terima orderan"
                            onPress={() => setDriverStatus('online')}
                        />
                        <StatusOption
                            active={status === 'busy'}
                            color={COLORS.secondary}
                            icon="time"
                            label="Sibuk"
                            desc="Sedang handle order / istirahat"
                            onPress={() => setDriverStatus('busy')}
                        />
                        <StatusOption
                            active={status === 'offline'}
                            color={COLORS.textMuted}
                            icon="radio-button-off"
                            label="Offline"
                            desc="Tidak menerima orderan"
                            onPress={() => setDriverStatus('offline')}
                        />
                    </View>
                </View>
            </Modal>

            {/* ===== ALERT & LOADING (komponen bersama) ===== */}
            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={alertState.buttons}
                onClose={hideAlert}
            />

            <LoadingModal visible={avatarUploading || statusUpdating || loggingOut} />
        </View>
    );
}

// ============================================================
// Sub-komponen
// ============================================================
function InfoRow({
    icon,
    label,
    value,
    spaced,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    spaced?: boolean;
}) {
    return (
        <View style={s.row}>
            <View style={s.rowIcon}>
                <Ionicons name={icon} size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>{label}</Text>
                <Text style={[s.rowValue, spaced && { letterSpacing: 1.5 }]}>{value}</Text>
            </View>
        </View>
    );
}

function MenuItem({
    icon,
    label,
    badge,
    badgeColor,
    danger,
    last,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    badge?: string;
    badgeColor?: string;
    danger?: boolean;
    last?: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[s.menuItem, last && { borderBottomWidth: 0 }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[s.menuIcon, danger && { backgroundColor: COLORS.dangerSoft }]}>
                <Ionicons name={icon} size={20} color={danger ? COLORS.danger : COLORS.primary} />
            </View>
            <Text style={[s.menuLabel, danger && { color: COLORS.danger }]}>{label}</Text>
            {badge && (
                <View style={[s.menuBadge, { backgroundColor: badgeColor ?? COLORS.primary }]}>
                    <Text style={s.menuBadgeText}>{badge}</Text>
                </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
    );
}

function StatusOption({
    active,
    color,
    icon,
    label,
    desc,
    onPress,
}: {
    active: boolean;
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    desc: string;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            style={[
                s.statusOption,
                active && { borderColor: color, backgroundColor: `${color}15` },
            ]}
        >
            <View style={[s.statusOptionIcon, { backgroundColor: `${color}25` }]}>
                <Ionicons name={icon} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.statusOptionLabel}>{label}</Text>
                <Text style={s.statusOptionDesc}>{desc}</Text>
            </View>
            {active && <Ionicons name="checkmark-circle" size={24} color={color} />}
        </TouchableOpacity>
    );
}

// ============================================================
// Styles
// ============================================================
const s = StyleSheet.create({
    header: {
        alignItems: 'center',
        paddingBottom: 56,
        paddingHorizontal: 20,
        backgroundColor: COLORS.primary,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        overflow: 'hidden',
    },
    headerCircleA: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: -70,
        right: -60,
    },
    headerCircleB: {
        position: 'absolute',
        width: 150,
        height: 150,
        borderRadius: 75,
        backgroundColor: 'rgba(255,255,255,0.06)',
        bottom: -40,
        left: -40,
    },
    avatarWrap: { position: 'relative', marginBottom: 12 },
    avatar: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#dfe3e8',
        borderWidth: 4,
        borderColor: '#fff',
    },
    avatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primaryDark,
    },
    avatarText: { color: '#fff', fontSize: 34, fontWeight: '800' },
    statusDot: {
        position: 'absolute',
        top: 6,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: '#fff',
    },
    cameraBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: COLORS.secondary,
        borderWidth: 3,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: { fontSize: 21, fontWeight: '800', color: '#fff', marginTop: 4 },
    email: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    verifyPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 10,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    verifyPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },

    statsCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: -32,
        paddingVertical: 16,
        borderRadius: 18,
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    miniDot: { width: 8, height: 8, borderRadius: 4 },
    statValue: { fontSize: 17, fontWeight: '800', color: COLORS.textDark },
    statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
    statDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

    card: {
        backgroundColor: COLORS.card,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: COLORS.textDark,
        marginBottom: 12,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    editPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: COLORS.primarySoft,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
    },
    editPillText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },

    statusCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1.5,
    },
    statusIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusText: { fontSize: 15, fontWeight: '800', color: COLORS.textDark },
    statusSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
    changePill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    changePillText: { fontSize: 12, fontWeight: '700', color: COLORS.textDark },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
    },
    rowIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: COLORS.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: { fontSize: 12, color: COLORS.textMuted },
    rowValue: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textDark,
        marginTop: 2,
    },
    rowDivider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginLeft: 50,
    },

    servicesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    serviceChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: COLORS.primarySoft,
        borderWidth: 1,
        borderColor: `${COLORS.primary}66`,
    },
    serviceChipText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
    emptyBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: COLORS.bg,
        marginTop: 4,
    },
    empty: { fontSize: 13, color: COLORS.textMuted },

    editProfileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
        paddingVertical: 13,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        backgroundColor: '#fff',
    },
    editProfileText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

    menuWrap: {
        marginTop: 16,
        marginHorizontal: 16,
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
    },
    menuIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textDark },
    menuBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    menuBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

    version: {
        textAlign: 'center',
        fontSize: 11,
        color: COLORS.textMuted,
        marginTop: 24,
    },

    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: COLORS.border,
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: COLORS.textDark,
        marginBottom: 4,
    },
    modalSub: { fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
    statusOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        marginBottom: 10,
    },
    statusOptionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusOptionLabel: { fontSize: 15, fontWeight: '800', color: COLORS.textDark },
    statusOptionDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});