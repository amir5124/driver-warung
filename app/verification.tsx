// app/verification.tsx
import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import { api } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Image,
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

// ============================================================
// Types
// ============================================================
type VerificationStatus = 'pending' | 'approved' | 'rejected';

type ExistingVerification = {
    status: VerificationStatus;
    rejection_reason: string | null;
    ktp_number?: string | null;
    sim_number?: string | null;
    stnk_number?: string | null;
    plate_number?: string | null;
    ktp_photo_url?: string | null;
    sim_photo_url?: string | null;
    stnk_photo_url?: string | null;
    selfie_photo_url?: string | null;
};

// ============================================================
// MAIN
// ============================================================
export default function VerificationScreen() {
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form
    const [ktpNumber, setKtpNumber] = useState('');
    const [simNumber, setSimNumber] = useState('');
    const [simType, setSimType] = useState<'A' | 'B1' | 'C'>('C');
    const [stnkNumber, setStnkNumber] = useState('');
    const [plateNumber, setPlateNumber] = useState('');

    // Photos
    const [ktpUri, setKtpUri] = useState<string | null>(null);
    const [simUri, setSimUri] = useState<string | null>(null);
    const [stnkUri, setStnkUri] = useState<string | null>(null);
    const [selfieUri, setSelfieUri] = useState<string | null>(null);

    const [existing, setExisting] = useState<ExistingVerification | null>(null);

    // Alert
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
    }>({ visible: false, title: '', message: '' });

    const showAlert = (title: string, message: string) =>
        setAlertState({ visible: true, title, message });

    const hideAlert = () =>
        setAlertState((a) => ({ ...a, visible: false }));

    // ============================================================
    // Load existing verification
    // ============================================================
    useEffect(() => {
        (async () => {
            try {
                const data = await api.drivers.getVerification();
                if (data) {
                    setExisting({
                        status: data.status,
                        rejection_reason: data.rejection_reason,
                        ktp_number: data.ktp_number,
                        sim_number: data.sim_number,
                        stnk_number: data.stnk_number,
                        plate_number: data.plate_number,
                        ktp_photo_url: data.ktp_photo_url,
                        sim_photo_url: data.sim_photo_url,
                        stnk_photo_url: data.stnk_photo_url,
                        selfie_photo_url: data.selfie_photo_url,
                    });

                    if (data.ktp_number) setKtpNumber(data.ktp_number);
                    if (data.sim_number) setSimNumber(data.sim_number);
                    if (data.stnk_number) setStnkNumber(data.stnk_number);
                    if (data.plate_number) setPlateNumber(data.plate_number);
                    if (data.ktp_photo_url) setKtpUri(data.ktp_photo_url);
                    if (data.sim_photo_url) setSimUri(data.sim_photo_url);
                    if (data.stnk_photo_url) setStnkUri(data.stnk_photo_url);
                    if (data.selfie_photo_url) setSelfieUri(data.selfie_photo_url);
                }
            } catch (err: any) {
                console.warn('[VERIFICATION] Gagal load:', err?.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ============================================================
    // Pick photo
    // ============================================================
    const pickPhoto = async (
        setter: (uri: string) => void,
        source: 'camera' | 'gallery',
        isSelfie = false
    ) => {
        try {
            const perm =
                source === 'camera'
                    ? await ImagePicker.requestCameraPermissionsAsync()
                    : await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (!perm.granted) {
                showAlert(
                    'Izin Dibutuhkan',
                    `Aktifkan akses ${source === 'camera' ? 'kamera' : 'galeri'} untuk upload dokumen.`
                );
                return;
            }

            const options: ImagePicker.ImagePickerOptions = isSelfie
                ? {
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.7,
                    cameraType: ImagePicker.CameraType.front,
                }
                : {
                    mediaTypes: ['images'],
                    allowsEditing: true,
                    aspect: [16, 10],
                    quality: 0.7,
                };

            const result =
                source === 'camera'
                    ? await ImagePicker.launchCameraAsync(options)
                    : await ImagePicker.launchImageLibraryAsync(options);

            if (result.canceled || !result.assets?.[0]) return;
            setter(result.assets[0].uri);
        } catch (err: any) {
            showAlert('Gagal', err?.message ?? 'Coba lagi.');
        }
    };

    // ============================================================
    // Submit
    // ============================================================
    const handleSubmit = async () => {
        // 🆕 Guard: cegah double-submit
        if (submitting) return;

        if (!ktpNumber.trim()) {
            showAlert('Lengkapi Data', 'Nomor KTP wajib diisi.');
            return;
        }
        if (!simNumber.trim()) {
            showAlert('Lengkapi Data', 'Nomor SIM wajib diisi.');
            return;
        }
        if (!stnkNumber.trim()) {
            showAlert('Lengkapi Data', 'Nomor STNK wajib diisi.');
            return;
        }
        if (!plateNumber.trim()) {
            showAlert('Lengkapi Data', 'Plat nomor wajib diisi.');
            return;
        }
        if (!ktpUri) {
            showAlert('Lengkapi Foto', 'Foto KTP wajib diupload.');
            return;
        }
        if (!simUri) {
            showAlert('Lengkapi Foto', 'Foto SIM wajib diupload.');
            return;
        }
        if (!stnkUri) {
            showAlert('Lengkapi Foto', 'Foto STNK wajib diupload.');
            return;
        }
        if (!selfieUri) {
            showAlert(
                'Lengkapi Foto',
                'Foto selfie dengan KTP wajib diupload.'
            );
            return;
        }

        // 🆕 Tampilkan LoadingModal
        setSubmitting(true);

        try {
            await api.drivers.submitVerification({
                ktpNumber: ktpNumber.trim(),
                simNumber: simNumber.trim(),
                simType,
                stnkNumber: stnkNumber.trim(),
                plateNumber: plateNumber.trim().toUpperCase(),
                ktpUri,
                simUri,
                stnkUri,
                selfieUri,
            });

            // 🆕 Sembunyikan loading dulu
            setSubmitting(false);

            // Update state lokal
            setExisting((prev) => ({
                ...(prev ?? { rejection_reason: null }),
                status: 'pending',
                rejection_reason: null,
            }));

            showAlert(
                'Berhasil Dikirim',
                'Dokumen verifikasi sudah dikirim. Tunggu review dari admin (1x24 jam).'
            );

            setTimeout(() => {
                hideAlert();
                router.back();
            }, 2000);
        } catch (err: any) {
            setSubmitting(false);
            showAlert(
                'Gagal Mengirim',
                err?.message ?? 'Coba lagi sebentar.'
            );
        }
    };

    // ============================================================
    // Loading awal
    // ============================================================
    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#fff' }}>
                <LoadingModal visible />
            </View>
        );
    }

    // ============================================================
    // Approved state
    // ============================================================
    if (existing?.status === 'approved') {
        return (
            <View
                style={[
                    s.container,
                    { paddingTop: insets.top + 20, padding: 20 },
                ]}
            >
                <View style={s.statusCard}>
                    <View style={s.statusIcon}>
                        <Ionicons
                            name="checkmark-circle"
                            size={64}
                            color="#1AA260"
                        />
                    </View>
                    <Text style={s.statusTitle}>Akun Terverifikasi</Text>
                    <Text style={s.statusDesc}>
                        Kamu sudah bisa online dan mulai menerima orderan.
                    </Text>
                    <Pressable
                        style={[
                            s.primaryBtn,
                            {
                                width: '100%',
                                alignSelf: 'stretch',
                            },
                        ]}
                        onPress={() => router.back()}
                    >
                        <Text style={s.primaryBtnText}>OK</Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    // ============================================================
    // Form state
    // ============================================================
    return (
        <>
            <KeyboardAvoidingView
                style={s.container}
                behavior="padding"
                keyboardVerticalOffset={
                    Platform.OS === 'ios' ? insets.top : 0
                }
            >
                {/* Header */}
                <View
                    style={[s.header, { paddingTop: insets.top + 12 }]}
                >
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
                    <Text style={s.headerTitle}>Verifikasi Akun</Text>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    contentContainerStyle={{
                        padding: 20,
                        paddingBottom: insets.bottom + 120,
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    {/* Status banner */}
                    {existing?.status === 'pending' && (
                        <View
                            style={[
                                s.statusBanner,
                                { backgroundColor: '#FEF3C7' },
                            ]}
                        >
                            <Ionicons
                                name="time"
                                size={20}
                                color="#92400E"
                            />
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={[
                                        s.statusBannerText,
                                        { color: '#92400E' },
                                    ]}
                                >
                                    Sedang Ditinjau
                                </Text>
                                <Text style={s.statusBannerSub}>
                                    Dokumen kamu sedang diperiksa admin
                                </Text>
                            </View>
                        </View>
                    )}

                    {existing?.status === 'rejected' && (
                        <View
                            style={[
                                s.statusBanner,
                                { backgroundColor: '#FDEAEA' },
                            ]}
                        >
                            <Ionicons
                                name="close-circle"
                                size={20}
                                color="#e24c4c"
                            />
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={[
                                        s.statusBannerText,
                                        { color: '#e24c4c' },
                                    ]}
                                >
                                    Verifikasi Ditolak
                                </Text>
                                {existing.rejection_reason && (
                                    <Text style={s.statusBannerSub}>
                                        {existing.rejection_reason}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    <Text style={s.sectionDesc}>
                        Upload dokumen berikut untuk verifikasi akun.
                        Dokumen akan ditinjau admin dalam 1x24 jam.
                    </Text>

                    {/* Foto KTP */}
                    <PhotoUpload
                        label="Foto KTP"
                        hint="Foto KTP jelas, tidak blur"
                        uri={ktpUri}
                        onPickCamera={() =>
                            pickPhoto(setKtpUri, 'camera')
                        }
                        onPickGallery={() =>
                            pickPhoto(setKtpUri, 'gallery')
                        }
                        onClear={() => setKtpUri(null)}
                    />

                    {/* Nomor KTP */}
                    <View style={s.field}>
                        <Text style={s.fieldLabel}>Nomor KTP</Text>
                        <TextInput
                            style={s.input}
                            placeholder="16 digit NIK"
                            placeholderTextColor="#8a94a6"
                            value={ktpNumber}
                            onChangeText={setKtpNumber}
                            keyboardType="numeric"
                            maxLength={16}
                        />
                    </View>

                    {/* Foto SIM */}
                    <PhotoUpload
                        label="Foto SIM"
                        hint="Foto SIM jelas, tidak blur"
                        uri={simUri}
                        onPickCamera={() =>
                            pickPhoto(setSimUri, 'camera')
                        }
                        onPickGallery={() =>
                            pickPhoto(setSimUri, 'gallery')
                        }
                        onClear={() => setSimUri(null)}
                    />

                    {/* Nomor SIM */}
                    <View style={s.field}>
                        <Text style={s.fieldLabel}>Nomor SIM</Text>
                        <TextInput
                            style={s.input}
                            placeholder="Nomor SIM"
                            placeholderTextColor="#8a94a6"
                            value={simNumber}
                            onChangeText={setSimNumber}
                            keyboardType="numeric"
                        />
                    </View>

                    {/* Jenis SIM */}
                    <View style={s.field}>
                        <Text style={s.fieldLabel}>Jenis SIM</Text>
                        <View style={s.simTypeRow}>
                            {(['A', 'B1', 'C'] as const).map((t) => (
                                <Pressable
                                    key={t}
                                    onPress={() => setSimType(t)}
                                    style={[
                                        s.simTypeBtn,
                                        simType === t &&
                                        s.simTypeBtnActive,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            s.simTypeText,
                                            simType === t &&
                                            s.simTypeTextActive,
                                        ]}
                                    >
                                        SIM {t}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {/* Foto STNK */}
                    <PhotoUpload
                        label="Foto STNK"
                        hint="Foto STNK jelas, tidak blur"
                        uri={stnkUri}
                        onPickCamera={() =>
                            pickPhoto(setStnkUri, 'camera')
                        }
                        onPickGallery={() =>
                            pickPhoto(setStnkUri, 'gallery')
                        }
                        onClear={() => setStnkUri(null)}
                    />

                    {/* Nomor STNK */}
                    <View style={s.field}>
                        <Text style={s.fieldLabel}>Nomor STNK</Text>
                        <TextInput
                            style={s.input}
                            placeholder="Nomor STNK"
                            placeholderTextColor="#8a94a6"
                            value={stnkNumber}
                            onChangeText={setStnkNumber}
                        />
                    </View>

                    {/* Plat Nomor */}
                    <View style={s.field}>
                        <Text style={s.fieldLabel}>Plat Nomor</Text>
                        <TextInput
                            style={[
                                s.input,
                                {
                                    letterSpacing: 2,
                                    fontWeight: '700',
                                },
                            ]}
                            placeholder="P 1234 ABC"
                            placeholderTextColor="#8a94a6"
                            value={plateNumber}
                            onChangeText={(t) =>
                                setPlateNumber(t.toUpperCase())
                            }
                            autoCapitalize="characters"
                        />
                    </View>

                    {/* Foto Selfie */}
                    <PhotoUpload
                        label="Foto Selfie dengan KTP"
                        hint="Selfie sambil pegang KTP di samping wajah"
                        uri={selfieUri}
                        onPickCamera={() =>
                            pickPhoto(setSelfieUri, 'camera', true)
                        }
                        onPickGallery={() =>
                            pickPhoto(setSelfieUri, 'gallery', true)
                        }
                        onClear={() => setSelfieUri(null)}
                    />

                    <View style={s.infoBox}>
                        <Ionicons
                            name="information-circle"
                            size={18}
                            color="#40a3ea"
                        />
                        <Text style={s.infoText}>
                            Pastikan semua dokumen terlihat jelas, tidak
                            blur, dan sesuai dengan data yang diisi.
                        </Text>
                    </View>
                </ScrollView>

                {/* Footer submit */}
                <View
                    style={[
                        s.footer,
                        { paddingBottom: insets.bottom + 16 },
                    ]}
                >
                    <Pressable
                        style={[
                            s.primaryBtn,
                            submitting && { opacity: 0.6 },
                        ]}
                        onPress={handleSubmit}
                        disabled={submitting}
                    >

                        <Text style={s.primaryBtnText}>
                            Kirim Verifikasi
                        </Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>

            {/* ===== AppAlert ===== */}
            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={[{ text: 'OK' }]}
                onClose={hideAlert}
            />

            {/* ===== Loading Modal (saat submit) ===== */}
            <LoadingModal visible={submitting} />
        </>
    );
}

// ============================================================
// Sub-component: PhotoUpload
// ============================================================
function PhotoUpload({
    label,
    hint,
    uri,
    onPickCamera,
    onPickGallery,
    onClear,
}: {
    label: string;
    hint?: string;
    uri: string | null;
    onPickCamera: () => void;
    onPickGallery: () => void;
    onClear: () => void;
}) {
    return (
        <View style={s.field}>
            <Text style={s.fieldLabel}>{label}</Text>
            {hint && <Text style={s.fieldHint}>{hint}</Text>}
            {uri ? (
                <View style={s.photoWrap}>
                    <Image
                        source={{ uri }}
                        style={s.photo}
                        resizeMode="cover"
                    />
                    <Pressable
                        style={s.photoClear}
                        onPress={onClear}
                    >
                        <Ionicons
                            name="close"
                            size={16}
                            color="#fff"
                        />
                    </Pressable>
                    <View style={s.photoBadge}>
                        <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color="#fff"
                        />
                        <Text style={s.photoBadgeText}>
                            Terupload
                        </Text>
                    </View>
                </View>
            ) : (
                <View style={s.photoRow}>
                    <Pressable
                        style={s.photoBtn}
                        onPress={onPickCamera}
                    >
                        <Ionicons
                            name="camera-outline"
                            size={20}
                            color="#40a3ea"
                        />
                        <Text style={s.photoBtnText}>
                            Ambil Foto
                        </Text>
                    </Pressable>
                    <Pressable
                        style={s.photoBtn}
                        onPress={onPickGallery}
                    >
                        <Ionicons
                            name="images-outline"
                            size={20}
                            color="#40a3ea"
                        />
                        <Text style={s.photoBtnText}>Galeri</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

// ============================================================
// Styles
// ============================================================
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
        flexShrink: 0,
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
        marginBottom: 20,
    },

    statusBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        marginBottom: 16,
    },
    statusBannerText: { fontSize: 14, fontWeight: '700' },
    statusBannerSub: {
        fontSize: 12,
        color: '#8a94a6',
        marginTop: 2,
    },

    statusCard: {
        margin: 20,
        padding: 24,
        backgroundColor: '#F5FBF7',
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#c8ecd5',
        alignItems: 'center',
    },
    statusIcon: { marginBottom: 12 },
    statusTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1f2933',
        marginBottom: 6,
    },
    statusDesc: {
        fontSize: 13,
        color: '#8a94a6',
        textAlign: 'center',
        marginBottom: 20,
    },

    field: { marginBottom: 16 },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1f2933',
        marginBottom: 4,
    },
    fieldHint: {
        fontSize: 11,
        color: '#8a94a6',
        marginBottom: 8,
        fontStyle: 'italic',
    },
    input: {
        borderWidth: 1,
        borderColor: '#e5e9f0',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#1f2933',
        backgroundColor: '#F9FAFB',
    },

    photoWrap: {
        position: 'relative',
        width: '100%',
        aspectRatio: 16 / 10,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#F9FAFB',
    },
    photo: { width: '100%', height: '100%' },
    photoClear: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoBadge: {
        position: 'absolute',
        left: 8,
        bottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(26,162,96,0.9)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    photoBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    photoRow: { flexDirection: 'row', gap: 10 },
    photoBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 24,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: '#40a3ea',
        borderRadius: 12,
        backgroundColor: '#EAF4FD',
    },
    photoBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#40a3ea',
    },

    simTypeRow: { flexDirection: 'row', gap: 10 },
    simTypeBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: '#e5e9f0',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    simTypeBtnActive: {
        borderColor: '#40a3ea',
        backgroundColor: '#EAF4FD',
    },
    simTypeText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#8a94a6',
    },
    simTypeTextActive: { color: '#40a3ea' },

    infoBox: {
        flexDirection: 'row',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#EAF4FD',
        marginTop: 8,
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
        flexShrink: 0,
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#40a3ea',
    },
    primaryBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
});