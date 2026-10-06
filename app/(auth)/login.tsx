import { api, saveToken } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/push';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
    primary: '#40a3ea',
    secondary: '#e68515',
    bg: '#ffffff',
    card: '#f7f9fb',
    border: '#e5e9f0',
    textDark: '#1f2933',
    textMuted: '#8a94a6',
    placeholder: '#a9b1bd',
};

const HERO_IMAGE = require('@/assets/images/hero.png');

export default function DriverLoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const [errorModalVisible, setErrorModalVisible] = useState(false);
    const [errorTitle, setErrorTitle] = useState('');
    const [errorMessage, setErrorMessage] = useState('');

    const showErrorModal = (title: string, message: string) => {
        setErrorTitle(title);
        setErrorMessage(message);
        setTimeout(
            () => setErrorModalVisible(true),
            Platform.OS === 'ios' ? 400 : 0
        );
    };

    const handleSignIn = async () => {
        if (!email.trim() || !password.trim()) {
            showErrorModal(
                'Data belum lengkap',
                'Email dan kata sandi wajib diisi.'
            );
            return;
        }

        setLoading(true);
        console.log(
            '[DRIVER-LOGIN] Mulai login:',
            email.trim().toLowerCase()
        );

        try {
            // ⬇️ STEP 1: login (TANPA auth)
            const res = await api.login({
                email: email.trim().toLowerCase(),
                password,
            });

            console.log('[DRIVER-LOGIN] Response:', {
                userId: res.userId,
                role: res.role,
            });

            if (res.role !== 'driver') {
                showErrorModal(
                    'Akses Ditolak',
                    'Akun ini bukan akun driver. Gunakan aplikasi customer untuk akun ini.'
                );
                return;
            }

            // ⬇️ STEP 2: simpan token SETELAH role check
            await saveToken(res.token);
            console.log('[DRIVER-LOGIN] Token tersimpan');

            // ⬇️ STEP 3: ambil profile (dengan auth)
            const profile = await api.me();
            console.log('[DRIVER-LOGIN] Profil:', {
                id: profile.id,
                full_name: profile.full_name,
                phone: profile.phone,
                role: profile.role,
            });

            await AsyncStorage.setItem(
                'profile',
                JSON.stringify(profile)
            );

            // ⬇️ STEP 4: register push (gagal = tidak menghalangi login)
            try {
                const fcmToken = await registerForPushNotifications();
                if (fcmToken) {
                    console.log(
                        '[DRIVER-LOGIN] FCM token:',
                        fcmToken
                    );
                    const updated = await api.me();
                    await AsyncStorage.setItem(
                        'profile',
                        JSON.stringify(updated)
                    );
                }
            } catch (pushErr: any) {
                console.warn(
                    '[DRIVER-LOGIN] Push gagal:',
                    pushErr?.message
                );
            }

            // ⬇️ STEP 5: set status online (best-effort)
            try {
                await api.drivers.setStatus('online');
                console.log('[DRIVER-LOGIN] Driver online');
            } catch (err: any) {
                console.warn(
                    '[DRIVER-LOGIN] Gagal set online:',
                    err.message
                );
            }

            // ⬇️ STEP 6: redirect
            console.log('[DRIVER-LOGIN] Redirect ke /(tabs)');
            router.replace('/(tabs)' as any);
        } catch (err: any) {
            console.error(
                '[DRIVER-LOGIN] Gagal:',
                err.message
            );
            showErrorModal(
                'Login Gagal',
                err.message || 'Periksa email dan kata sandi Anda.'
            );
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = () => {
        router.push('/(auth)/register' as any);
    };

    useEffect(() => {
        const sub = BackHandler.addEventListener(
            'hardwareBackPress',
            () => false
        );
        return () => sub.remove();
    }, []);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar
                barStyle="dark-content"
                backgroundColor={COLORS.bg}
            />

            {/* behavior="height": tinggi layar dikurangi setinggi keyboard,
                sehingga hero (flex: 1) menyusut dan form tetap terlihat. */}
            <KeyboardAvoidingView
                style={styles.flex}
                behavior="height"
            >
                <View style={styles.heroWrap}>
                    <Image
                        source={HERO_IMAGE}
                        style={styles.heroImage}
                        resizeMode="contain"
                    />
                </View>

                <View style={styles.bottom}>
                    <Text style={styles.title}>
                        Halo, Mitra Driver! Udah siap jalan?
                    </Text>
                    <Text style={styles.subtitle}>
                        Yuk, masuk untuk mulai terima orderan!
                    </Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor={COLORS.placeholder}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        value={email}
                        onChangeText={setEmail}
                        editable={!loading}
                    />

                    <View style={styles.passwordWrapper}>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="Kata sandi"
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

                    <TouchableOpacity
                        style={[
                            styles.bigButton,
                            loading && { opacity: 0.6 },
                        ]}
                        activeOpacity={0.85}
                        onPress={handleSignIn}
                        disabled={loading}
                    >
                        <Text style={styles.bigButtonText}>MASUK</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.outlineButton}
                        activeOpacity={0.85}
                        onPress={handleRegister}
                        disabled={loading}
                    >
                        <Text style={styles.outlineButtonText}>
                            DAFTAR JADI MITRA
                        </Text>
                    </TouchableOpacity>

                    <Text style={styles.footerNote}>
                        Klik Daftar jadi Mitra untuk mulai daftar,
                        lanjutkan atau cek status pendaftaran.
                    </Text>
                </View>
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
                        <ActivityIndicator
                            size="large"
                            color={COLORS.primary}
                        />
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
                        <View style={styles.flex} />
                    </TouchableWithoutFeedback>

                    <View style={styles.sheetContainer}>
                        <TouchableOpacity
                            onPress={() => setErrorModalVisible(false)}
                            style={styles.sheetCloseButton}
                        >
                            <Ionicons
                                name="close"
                                size={24}
                                color="#1c1c1c"
                            />
                        </TouchableOpacity>

                        <Text style={styles.sheetTitle}>
                            {errorTitle}
                        </Text>
                        <Text style={styles.sheetDescription}>
                            {errorMessage}
                        </Text>

                        <TouchableOpacity
                            onPress={() => setErrorModalVisible(false)}
                            style={styles.sheetButton}
                        >
                            <Text style={styles.sheetButtonText}>
                                Mengerti
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: { flex: 1, backgroundColor: COLORS.bg },

    heroWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    heroImage: { width: '100%', height: '100%' },

    bottom: {
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: COLORS.textDark,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 14,
        color: COLORS.textMuted,
        marginBottom: 16,
    },

    input: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: COLORS.textDark,
        marginBottom: 10,
    },
    passwordWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    passwordInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 14,
        color: COLORS.textDark,
    },

    bigButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 8,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    bigButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 1,
    },
    outlineButton: {
        height: 48,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    outlineButtonText: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    footerNote: {
        fontSize: 13,
        color: COLORS.textMuted,
        lineHeight: 19,
    },

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
        backgroundColor: '#ffffff',
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