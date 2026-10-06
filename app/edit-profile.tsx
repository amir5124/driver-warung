// app/edit-profile.tsx
import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import { colors } from '@/constants/ojek-theme';
import { api } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

export default function EditProfileScreen() {
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

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

    // ============================================================
    // Load profile
    // ============================================================
    useEffect(() => {
        (async () => {
            try {
                const p = await api.me();
                setFullName(p.full_name ?? '');
                setEmail(p.email ?? '');
                setPhone(p.phone ?? '');
            } catch (err: any) {
                console.warn('[EDIT-PROFILE] Gagal load:', err?.message);
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

    // ============================================================
    // Save
    // ============================================================
    const handleSave = async () => {
        if (saving) return;

        const name = fullName.trim();
        const mail = email.trim();
        const phoneNum = phone.trim();

        if (!name) {
            showAlert('Nama wajib diisi', '', [{ text: 'OK' }]);
            return;
        }
        if (mail && !/^\S+@\S+\.\S+$/.test(mail)) {
            showAlert('Email tidak valid', 'Periksa kembali email kamu.', [
                { text: 'OK' },
            ]);
            return;
        }

        setSaving(true);
        try {
            const updated = await api.updateProfile({
                full_name: name,
                email: mail || undefined,
                phone: phoneNum || undefined,
            });

            await AsyncStorage.setItem(
                'profile',
                JSON.stringify(updated)
            );

            await new Promise((r) =>
                setTimeout(r, Platform.OS === 'ios' ? 300 : 100)
            );

            showAlert('Berhasil', 'Profil sudah diperbarui.', [
                {
                    text: 'OK',
                    onPress: () => router.back(),
                },
            ]);
        } catch (err: any) {
            console.warn('[EDIT-PROFILE] Gagal save:', err?.message);
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
                <Text style={s.headerTitle}>Data Diri</Text>
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
                    <Text style={s.sectionDesc}>
                        Pastikan data di bawah ini benar. Data akan
                        ditampilkan ke customer saat kamu menerima
                        orderan.
                    </Text>

                    <FormField
                        label="Nama Lengkap"
                        placeholder="Nama sesuai KTP"
                        value={fullName}
                        onChangeText={setFullName}
                        icon="person-outline"
                    />

                    <FormField
                        label="Email"
                        placeholder="email@example.com"
                        value={email}
                        onChangeText={setEmail}
                        icon="mail-outline"
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <FormField
                        label="Nomor HP"
                        placeholder="08123456789"
                        value={phone}
                        onChangeText={setPhone}
                        icon="call-outline"
                        keyboardType="phone-pad"
                    />

                    <View style={s.infoBox}>
                        <Ionicons
                            name="shield-checkmark"
                            size={18}
                            color={colors.primary}
                        />
                        <Text style={s.infoText}>
                            Data kamu aman dan tidak akan dibagikan ke
                            pihak lain tanpa izin.
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
    keyboardType?: 'default' | 'email-address' | 'phone-pad';
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

    sectionDesc: {
        fontSize: 13,
        color: '#8a94a6',
        lineHeight: 19,
        marginBottom: 24,
    },

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