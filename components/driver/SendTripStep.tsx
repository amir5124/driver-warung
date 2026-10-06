import Avatar from '@/components/Avatar';
import { colors } from '@/constants/ojek-theme';
import { useUserLocation } from '@/hooks/use-user-location';
import { api, OrderResponse } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import type { DriverOrder } from '@/types/driver';
import type { Coords } from '@/types/ojek';
import { formatPhoneDisplay, normalizePhone } from '@/utils/phone';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SwipeButton from './SwipeButton';
import TripMapShell from './TripMapShell';

type Phase =
    | 'toPickup'
    | 'atPickup'
    | 'photoPackage'
    | 'toReceiver'
    | 'confirmDelivery';

type Props = {
    order: DriverOrder;
    onComplete: (receivedBy: string, sendCode: string) => void;
    /** 🆕 Dipanggil saat order di-cancel / error 409 */
    onCancelExit: (title: string, message: string) => void;
    onChat?: () => void;
};

const SAMPLE_GOOD = require('../../assets/images/motor.png');
const EMERGENCY_NUMBER = '62812285777';

function isNear(a: Coords, b: Coords, maxDeg = 0.05) {
    return (
        Math.abs(a.latitude - b.latitude) < maxDeg &&
        Math.abs(a.longitude - b.longitude) < maxDeg
    );
}

const PACKAGE_SIZE_LABEL: Record<string, string> = {
    kecil: 'Kecil',
    sedang: 'Sedang',
    besar: 'Besar',
};

const PACKAGE_PROTECTION_LABEL: Record<string, string> = {
    silver: 'Silver',
    gold: 'Gold',
};

const PACKAGE_PROTECTION_COLOR: Record<string, string> = {
    silver: '#9CA3AF',
    gold: '#F5A623',
};

export default function SendTripStep({
    order,
    onComplete,
    onCancelExit,
    onChat,
}: Props) {
    const insets = useSafeAreaInsets();
    const [phase, setPhase] = useState<Phase>('toPickup');
    const [receivedBy, setReceivedBy] = useState('');
    const [sendCode, setSendCode] = useState('');
    const [currentOrder, setCurrentOrder] = useState<OrderResponse | null>(null);
    const [unread, setUnread] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    // Foto paket
    const [packagePhotoUri, setPackagePhotoUri] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [photoUploaded, setPhotoUploaded] = useState(false);

    // Customer info lengkap dengan rating & reviews
    const [customerInfo, setCustomerInfo] = useState<{
        name: string;
        avatarUrl: string | null;
        phone: string | null;
        rating: number | null;
        reviews: number;
    }>({
        name: order.customerName,
        avatarUrl: null,
        phone: null,
        rating: order.customerRating ?? null,
        reviews: order.customerReviews ?? 0,
    });

    const location = useUserLocation();

    // ============================================================
    // Load detail order
    // ============================================================
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const fresh = await api.orders.get(Number(order.id));
                if (!alive) return;
                setCurrentOrder(fresh);

                // Foto paket dari order (kalau reload)
                if (fresh.package_photo_url) {
                    setPackagePhotoUri(fresh.package_photo_url);
                    setPhotoUploaded(true);
                }

                // Parse customer info + rating & reviews
                if (fresh.customer) {
                    const ratingAvg =
                        (fresh.customer as any).rating_avg ?? null;

                    const reviewCount =
                        (fresh.customer as any).total_reviews ??
                        (fresh.customer as any).stats?.review_count ??
                        0;

                    setCustomerInfo({
                        name:
                            fresh.customer.full_name ??
                            order.customerName ??
                            'Customer',
                        avatarUrl: fresh.customer.avatar_url ?? null,
                        phone: (fresh.customer as any).phone ?? null,
                        rating: ratingAvg,
                        reviews: reviewCount,
                    });

                    console.log('[SEND-TRIP] Customer info:', {
                        name: fresh.customer.full_name,
                        rating: ratingAvg,
                        reviews: reviewCount,
                    });
                }
            } catch (err: any) {
                console.warn('[SEND-TRIP] Gagal load order:', err?.message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [order.id, order.customerName]);

    // ============================================================
    // 🆕 POLLING STATUS — deteksi cancel
    // ============================================================
    useEffect(() => {
        if (!order.id) return;

        let alive = true;
        let cancelled = false;

        const checkStatus = async () => {
            if (cancelled) return;
            try {
                const fresh = await api.orders.get(Number(order.id));
                if (!alive) return;

                if (fresh.status === 'cancelled') {
                    cancelled = true;
                    console.log(
                        '[SEND-TRIP] Order cancelled detected:',
                        order.id
                    );

                    onCancelExit(
                        'Orderan Dibatalkan',
                        fresh.cancellation_reason
                            ? `Alasan: ${fresh.cancellation_reason}`
                            : `Orderan dibatalkan oleh ${fresh.customer?.full_name ??
                            order.customerName ??
                            'Customer'
                            }`
                    );
                }
            } catch {
                // Silent — jangan ganggu UI
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);

        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, [order.id, order.customerName, onCancelExit]);

    // ============================================================
    // Data display
    // ============================================================
    const customerName = customerInfo.name;
    const customerAvatarUrl = customerInfo.avatarUrl;
    const customerRating = customerInfo.rating;
    const customerReviews = customerInfo.reviews;

    // Pengirim
    const senderName = currentOrder?.sender_name ?? customerName;
    const senderPhone =
        currentOrder?.sender_phone ??
        (currentOrder?.customer as any)?.phone ??
        customerInfo.phone ??
        null;
    const senderLandmark = currentOrder?.sender_landmark ?? null;

    // Penerima
    const receiverName =
        currentOrder?.receiver_name ?? order.receiverName ?? 'Penerima';
    const receiverPhone = currentOrder?.receiver_phone ?? null;
    const receiverLandmark = currentOrder?.receiver_landmark ?? null;

    // Paket
    const packageType = currentOrder?.package_type ?? null;
    const packageSize = currentOrder?.package_size ?? null;
    const packageWeight = currentOrder?.package_weight ?? null;
    const packageProtection = currentOrder?.package_protection ?? null;

    const pickup = {
        name: currentOrder?.pickup_name ?? order.pickup.name,
        address: currentOrder?.pickup_address ?? order.pickup.address,
        coords: currentOrder?.pickup_coords ?? order.pickup.coords,
    };
    const dropoff = {
        name: currentOrder?.dropoff_name ?? order.dropoff.name,
        address: currentOrder?.dropoff_address ?? order.dropoff.address,
        coords: currentOrder?.dropoff_coords ?? order.dropoff.coords,
    };

    // ============================================================
    // Badge pesan belum dibaca
    // ============================================================
    const fetchUnread = useCallback(async () => {
        try {
            const res = await api.chat.unreadByOrder(Number(order.id));
            setUnread(res.unread);
        } catch (err: any) {
            console.warn('[SEND-TRIP] gagal ambil unread:', err?.message);
        }
    }, [order.id]);

    useFocusEffect(
        useCallback(() => {
            fetchUnread();
        }, [fetchUnread])
    );

    useEffect(() => {
        const channel = supabase
            .channel(`order-chat:${order.id}`)
            .on('broadcast', { event: 'new_message' }, () => fetchUnread())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [order.id, fetchUnread]);

    // ============================================================
    // Telepon, SMS, darurat
    // ============================================================
    const callNumber = (phone: string | null) => {
        const normalized = normalizePhone(phone);
        if (!normalized) {
            Alert.alert('Nomor tidak tersedia', 'Nomor telepon belum tersedia.');
            return;
        }
        Linking.openURL(`tel:${normalized}`).catch(() => {
            Alert.alert('Gagal', 'Tidak bisa membuka aplikasi telepon.');
        });
    };

    const smsNumber = (phone: string | null) => {
        const normalized = normalizePhone(phone);
        if (!normalized) {
            Alert.alert('Nomor tidak tersedia', 'Nomor telepon belum tersedia.');
            return;
        }
        Linking.openURL(`sms:${normalized}`).catch(() => {
            Alert.alert('Gagal', 'Tidak bisa membuka aplikasi pesan.');
        });
    };

    const handleEmergency = () => {
        const text = encodeURIComponent(
            `DARURAT! Saya driver pengantar paket (order #${order.id}). Mohon bantuan.`
        );
        Linking.openURL(`https://wa.me/${EMERGENCY_NUMBER}?text=${text}`).catch(
            () => {
                Linking.openURL(`tel:+${EMERGENCY_NUMBER}`).catch(() => {
                    Alert.alert('Gagal', 'Tidak bisa menghubungi nomor darurat.');
                });
            }
        );
    };

    // ============================================================
    // 🆕 Helper: deteksi error order tidak aktif
    // ============================================================
    const isOrderInactiveError = (msg: string): boolean => {
        return (
            msg.includes('dibatalkan') ||
            msg.includes('sudah selesai') ||
            msg.includes('Tidak bisa ubah status')
        );
    };

    // ============================================================
    // Upload foto paket
    // ============================================================
    const uploadPhoto = useCallback(
        async (uri: string) => {
            setUploading(true);
            try {
                const res = await api.orders.uploadPackagePhoto(
                    Number(order.id),
                    uri
                );
                console.log(
                    '[SEND-TRIP] Foto terupload:',
                    res.package_photo_url
                );
                setPhotoUploaded(true);
            } catch (err: any) {
                const msg = err?.message ?? '';
                console.warn('[SEND-TRIP] Gagal upload foto:', msg);

                // 🆕 Kalau order sudah tidak aktif
                if (isOrderInactiveError(msg)) {
                    onCancelExit('Orderan Tidak Aktif', msg);
                    return;
                }

                Alert.alert(
                    'Gagal Upload',
                    msg || 'Coba ambil foto lagi.',
                    [{ text: 'OK' }]
                );
                setPhotoUploaded(false);
            } finally {
                setUploading(false);
            }
        },
        [order.id, onCancelExit]
    );

    const handleTakePhoto = useCallback(async () => {
        try {
            const { status } =
                await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Izin Kamera Ditolak',
                    'Aplikasi butuh akses kamera untuk foto paket.',
                    [{ text: 'OK' }]
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.7,
                cameraType: ImagePicker.CameraType.back,
            });

            if (result.canceled || !result.assets?.[0]) return;

            const asset = result.assets[0];
            setPackagePhotoUri(asset.uri);
            setPhotoUploaded(false);

            await uploadPhoto(asset.uri);
        } catch (err: any) {
            console.warn('[SEND-TRIP] Gagal ambil foto:', err?.message);
            Alert.alert('Gagal', 'Tidak bisa membuka kamera.');
        }
    }, [uploadPhoto]);

    // ============================================================
    // Submit konfirmasi pengiriman
    // ============================================================
    const handleConfirmDelivery = async () => {
        if (!receivedBy.trim()) {
            Alert.alert('Nama penerima wajib diisi');
            return;
        }
        if (!sendCode.trim()) {
            Alert.alert(
                'Kode terima wajib diisi',
                'Minta kode ke penerima paket dulu ya.'
            );
            return;
        }
        if (submitting) return;

        setSubmitting(true);
        try {
            await onComplete(
                receivedBy.trim(),
                sendCode.trim().toUpperCase()
            );
        } catch (err: any) {
            const msg = err?.message ?? '';
            console.warn('[SEND-TRIP] Gagal konfirmasi:', msg);

            // 🆕 Deteksi order cancel / selesai
            if (isOrderInactiveError(msg)) {
                onCancelExit('Orderan Tidak Aktif', msg);
                return;
            }

            Alert.alert('Gagal', msg || 'Coba lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    // ============================================================
    // Koordinat & target
    // ============================================================
    const headingToReceiver =
        phase === 'toReceiver' || phase === 'confirmDelivery';
    const target = headingToReceiver ? dropoff : pickup;
    const targetColor = headingToReceiver ? '#f26b21' : '#1AA260';

    const gpsCoords = location.coords;
    const fallbackDriverCoords: Coords = {
        latitude: pickup.coords.latitude - 0.006,
        longitude: pickup.coords.longitude - 0.004,
    };
    const driverCoords =
        gpsCoords && isNear(gpsCoords, pickup.coords)
            ? gpsCoords
            : fallbackDriverCoords;

    const safeBottomPad = Math.max(insets.bottom, 16);

    // ============================================================
    // Tombol chat dengan badge
    // ============================================================
    const renderChatButton = () => (
        <Pressable
            style={s.chatBtn}
            onPress={onChat}
            disabled={!onChat}
            hitSlop={8}
        >
            <Ionicons
                name="chatbubble-ellipses-outline"
                size={20}
                color={colors.text}
            />
            {unread > 0 && (
                <View style={s.badge}>
                    <Text style={s.badgeText}>
                        {unread > 99 ? '99+' : unread}
                    </Text>
                </View>
            )}
        </Pressable>
    );

    const renderCallSms = (phone: string | null) => {
        const valid = normalizePhone(phone) !== null;
        return (
            <View style={s.callSmsRow}>
                <Pressable
                    style={[s.callSmsCol, !valid && s.dim]}
                    onPress={() => callNumber(phone)}
                >
                    <Ionicons
                        name="call-outline"
                        size={18}
                        color={colors.text}
                    />
                    <Text style={s.callSmsText}>Call</Text>
                </Pressable>
                <Pressable
                    style={[s.callSmsCol, !valid && s.dim]}
                    onPress={() => smsNumber(phone)}
                >
                    <Ionicons
                        name="chatbox-ellipses-outline"
                        size={18}
                        color={colors.text}
                    />
                    <Text style={s.callSmsText}>SMS</Text>
                </Pressable>
            </View>
        );
    };

    // ============================================================
    // Card: Pengirim
    // ============================================================
    const renderSenderCard = () => {
        const showRating =
            customerRating != null && customerReviews > 0;

        return (
            <View style={s.card}>
                <View style={s.cardHeader}>
                    <View
                        style={[s.cardIcon, { backgroundColor: '#1AA260' }]}
                    >
                        <Ionicons name="person" size={14} color="#fff" />
                    </View>
                    <Text style={s.cardTitle}>Pengirim</Text>
                    {renderChatButton()}
                </View>

                <View style={s.cardBody}>
                    <View style={s.cardRow}>
                        <Avatar
                            uri={customerAvatarUrl}
                            name={senderName}
                            size={40}
                            backgroundColor="#1AA260"
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={s.cardName} numberOfLines={1}>
                                {senderName}
                            </Text>

                            {showRating ? (
                                <View style={s.ratingRow}>
                                    <Ionicons
                                        name="star"
                                        size={11}
                                        color="#F5A623"
                                    />
                                    <Text style={s.cardRating}>
                                        {Number(customerRating).toFixed(1)} •{' '}
                                        {customerReviews} ulasan
                                    </Text>
                                </View>
                            ) : (
                                <Text style={s.cardRating}>
                                    Customer baru
                                </Text>
                            )}

                            {senderPhone ? (
                                <Text
                                    style={s.cardPhone}
                                    numberOfLines={1}
                                >
                                    {formatPhoneDisplay(senderPhone)}
                                </Text>
                            ) : (
                                <Text style={s.cardMuted}>
                                    Nomor tidak tersedia
                                </Text>
                            )}
                        </View>
                    </View>

                    <View style={s.cardDivider} />

                    <View style={s.cardRow}>
                        <Ionicons
                            name="location-outline"
                            size={16}
                            color={colors.textMuted}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={s.cardLabel}>Titik jemput</Text>
                            <Text style={s.cardValue} numberOfLines={2}>
                                {pickup.address}
                            </Text>
                            {senderLandmark ? (
                                <Text style={s.cardLandmark}>
                                    Patokan: {senderLandmark}
                                </Text>
                            ) : null}
                        </View>
                    </View>

                    {renderCallSms(senderPhone)}
                </View>
            </View>
        );
    };

    // ============================================================
    // Card: Penerima
    // ============================================================
    const renderReceiverCard = () => (
        <View style={s.card}>
            <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#f26b21' }]}>
                    <Ionicons name="person" size={14} color="#fff" />
                </View>
                <Text style={s.cardTitle}>Penerima</Text>
            </View>

            <View style={s.cardBody}>
                <View style={s.cardRow}>
                    <Avatar
                        uri={null}
                        name={receiverName}
                        size={40}
                        backgroundColor="#f26b21"
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={s.cardName} numberOfLines={1}>
                            {receiverName}
                        </Text>
                        {receiverPhone ? (
                            <Text style={s.cardPhone} numberOfLines={1}>
                                {formatPhoneDisplay(receiverPhone)}
                            </Text>
                        ) : (
                            <Text style={s.cardMuted}>
                                Nomor tidak tersedia
                            </Text>
                        )}
                    </View>
                </View>

                <View style={s.cardDivider} />

                <View style={s.cardRow}>
                    <Ionicons
                        name="location-outline"
                        size={16}
                        color={colors.textMuted}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={s.cardLabel}>Titik antar</Text>
                        <Text style={s.cardValue} numberOfLines={2}>
                            {dropoff.address}
                        </Text>
                        {receiverLandmark ? (
                            <Text style={s.cardLandmark}>
                                Patokan: {receiverLandmark}
                            </Text>
                        ) : null}
                    </View>
                </View>

                {renderCallSms(receiverPhone)}
            </View>
        </View>
    );

    // ============================================================
    // Card: Detail Paket
    // ============================================================
    const renderPackageCard = () => {
        const hasAnyPackageInfo =
            packageType || packageSize || packageWeight || packageProtection;
        if (!hasAnyPackageInfo) return null;

        return (
            <View style={s.card}>
                <View style={s.cardHeader}>
                    <View
                        style={[s.cardIcon, { backgroundColor: '#1877F2' }]}
                    >
                        <Ionicons name="cube" size={14} color="#fff" />
                    </View>
                    <Text style={s.cardTitle}>Detail Paket</Text>
                </View>

                <View style={s.cardBody}>
                    {packageType ? (
                        <View style={s.pkgRow}>
                            <Text style={s.pkgLabel}>Jenis</Text>
                            <Text style={s.pkgValue}>{packageType}</Text>
                        </View>
                    ) : null}
                    {packageSize ? (
                        <View style={s.pkgRow}>
                            <Text style={s.pkgLabel}>Ukuran</Text>
                            <Text style={s.pkgValue}>
                                {PACKAGE_SIZE_LABEL[packageSize] ??
                                    packageSize}
                            </Text>
                        </View>
                    ) : null}
                    {packageWeight ? (
                        <View style={s.pkgRow}>
                            <Text style={s.pkgLabel}>Berat</Text>
                            <Text style={s.pkgValue}>{packageWeight}</Text>
                        </View>
                    ) : null}
                    {packageProtection ? (
                        <View style={s.pkgRow}>
                            <Text style={s.pkgLabel}>Proteksi</Text>
                            <View
                                style={[
                                    s.pkgBadge,
                                    {
                                        backgroundColor:
                                            PACKAGE_PROTECTION_COLOR[
                                            packageProtection
                                            ] ?? '#9CA3AF',
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="shield-checkmark"
                                    size={10}
                                    color="#fff"
                                />
                                <Text style={s.pkgBadgeText}>
                                    {PACKAGE_PROTECTION_LABEL[
                                        packageProtection
                                    ] ?? packageProtection}
                                </Text>
                            </View>
                        </View>
                    ) : null}
                </View>
            </View>
        );
    };

    const quickCallPhone = headingToReceiver ? receiverPhone : senderPhone;

    return (
        <>
            <TripMapShell
                driverCoords={driverCoords}
                targetCoords={target.coords}
                targetColor={targetColor}
                vehicleType="send"
                showEmergency={
                    phase === 'toPickup' ||
                    phase === 'atPickup' ||
                    phase === 'toReceiver'
                }
                emergencyLabel="DARURAT"
                onEmergency={handleEmergency}
                sheetHeight={phase === 'atPickup' ? 420 : 220}
            >
                {phase === 'atPickup' ? (
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        style={{ maxHeight: 360 }}
                    >
                        {renderSenderCard()}
                        {renderReceiverCard()}
                        {renderPackageCard()}
                    </ScrollView>
                ) : (
                    <View style={s.stopRow}>
                        <View
                            style={[
                                s.stopIcon,
                                { backgroundColor: targetColor },
                            ]}
                        >
                            <Ionicons name="location" size={14} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.stopName} numberOfLines={1}>
                                {target.name}
                            </Text>
                            <Text style={s.stopAddr} numberOfLines={2}>
                                {target.address}
                            </Text>
                        </View>

                        <View style={s.actions}>
                            <Pressable
                                style={[s.chatBtn, !quickCallPhone && s.dim]}
                                onPress={() => callNumber(quickCallPhone)}
                                hitSlop={8}
                            >
                                <Ionicons
                                    name="call-outline"
                                    size={20}
                                    color={colors.text}
                                />
                            </Pressable>
                            {renderChatButton()}
                        </View>
                    </View>
                )}

                {phase === 'toPickup' && (
                    <SwipeButton
                        label="Udah di titik jemput"
                        color="#1877F2"
                        onConfirm={() => setPhase('atPickup')}
                    />
                )}
                {phase === 'atPickup' && (
                    <SwipeButton
                        label="Udah jemput paket"
                        color="#1877F2"
                        onConfirm={() => setPhase('photoPackage')}
                    />
                )}
                {phase === 'toReceiver' && (
                    <SwipeButton
                        label="Selesai antar"
                        color="#1AA260"
                        onConfirm={() => setPhase('confirmDelivery')}
                    />
                )}
            </TripMapShell>

            {/* ---- modal: foto paket ---- */}
            <Modal visible={phase === 'photoPackage'} animationType="slide">
                <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    <View
                        style={[
                            s.photoHeader,
                            { paddingTop: insets.top + 14 },
                        ]}
                    >
                        <Ionicons
                            name="arrow-back"
                            size={22}
                            color={colors.text}
                            onPress={() => {
                                if (!uploading) setPhase('atPickup');
                            }}
                        />
                        <Text style={s.photoHeaderTitle}>Foto Paket</Text>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 16 }}>
                        {!packagePhotoUri ? (
                            <>
                                <Text style={s.photoTitle}>
                                    Ikuti cara foto di bawah ini
                                </Text>
                                <Text style={s.photoSub}>
                                    Pastikan foto paket baik dan benar.
                                </Text>

                                <View style={s.photoRow}>
                                    <View style={s.photoBoxWrap}>
                                        <Image
                                            source={SAMPLE_GOOD}
                                            style={s.photoBox}
                                            resizeMode="cover"
                                        />
                                        <View
                                            style={[
                                                s.photoBadge,
                                                {
                                                    backgroundColor:
                                                        '#1AA260',
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name="checkmark"
                                                size={12}
                                                color="#fff"
                                            />
                                        </View>
                                    </View>
                                    <View style={s.photoBoxWrap}>
                                        <Image
                                            source={SAMPLE_GOOD}
                                            style={s.photoBox}
                                            resizeMode="cover"
                                        />
                                        <View
                                            style={[
                                                s.photoBadge,
                                                {
                                                    backgroundColor:
                                                        colors.danger,
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name="close"
                                                size={12}
                                                color="#fff"
                                            />
                                        </View>
                                    </View>
                                </View>
                                <Text style={s.photoNote}>
                                    • Foto paket di tempat terang biar jelas
                                    dan gak buram
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={s.photoTitle}>Foto Paket</Text>
                                <Text style={s.photoSub}>
                                    {uploading
                                        ? 'Mengunggah foto…'
                                        : photoUploaded
                                            ? 'Foto berhasil diunggah ✅'
                                            : 'Foto siap diunggah'}
                                </Text>

                                <View style={s.photoPreviewWrap}>
                                    <Image
                                        source={{ uri: packagePhotoUri }}
                                        style={s.photoPreview}
                                        resizeMode="cover"
                                    />

                                    {uploading && (
                                        <View style={s.photoOverlay}>
                                            <ActivityIndicator
                                                size="large"
                                                color="#fff"
                                            />
                                            <Text style={s.photoOverlayText}>
                                                Mengunggah…
                                            </Text>
                                        </View>
                                    )}

                                    {photoUploaded && !uploading && (
                                        <View
                                            style={[
                                                s.photoOverlay,
                                                {
                                                    backgroundColor:
                                                        'rgba(26,162,96,0.3)',
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={56}
                                                color="#fff"
                                            />
                                        </View>
                                    )}
                                </View>

                                <Pressable
                                    style={s.photoRetakeBtn}
                                    onPress={handleTakePhoto}
                                    disabled={uploading}
                                >
                                    <Ionicons
                                        name="camera-reverse-outline"
                                        size={18}
                                        color={colors.text}
                                    />
                                    <Text style={s.photoRetakeText}>
                                        Foto Ulang
                                    </Text>
                                </Pressable>
                            </>
                        )}
                    </ScrollView>

                    <View
                        style={{
                            padding: 16,
                            paddingBottom: safeBottomPad + 12,
                        }}
                    >
                        {!packagePhotoUri ? (
                            <Pressable
                                style={s.photoBtn}
                                onPress={handleTakePhoto}
                                disabled={uploading}
                            >
                                <Ionicons
                                    name="camera"
                                    size={20}
                                    color="#fff"
                                    style={{ marginRight: 8 }}
                                />
                                <Text style={s.photoBtnText}>
                                    Ambil Foto
                                </Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                style={[
                                    s.photoBtn,
                                    {
                                        opacity:
                                            photoUploaded && !uploading
                                                ? 1
                                                : 0.5,
                                    },
                                ]}
                                onPress={() => setPhase('toReceiver')}
                                disabled={!photoUploaded || uploading}
                            >
                                <Text style={s.photoBtnText}>
                                    {uploading
                                        ? 'Mengunggah…'
                                        : photoUploaded
                                            ? 'Lanjut Antar'
                                            : 'Tunggu upload…'}
                                </Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ---- modal: konfirmasi pengiriman ---- */}
            <Modal
                visible={phase === 'confirmDelivery'}
                animationType="slide"
                transparent
            >
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <View
                        style={[
                            s.confirmSheet,
                            { paddingBottom: safeBottomPad + 16 },
                        ]}
                    >
                        <Text style={s.confirmTitle}>
                            Konfirmasi Pengiriman
                        </Text>
                        <View style={s.confirmDividerFull} />

                        <Text style={s.confirmDesc}>
                            Sebagai bukti pengiriman sukses, masukkan nama
                            penerima dan kode terima paket.
                        </Text>

                        <Text style={s.confirmLabel}>
                            Paket diterima oleh
                        </Text>
                        <TextInput
                            value={receivedBy}
                            onChangeText={setReceivedBy}
                            placeholder="Nama penerima"
                            placeholderTextColor={colors.textMuted}
                            style={s.confirmInput}
                            editable={!submitting}
                        />

                        <Text style={s.confirmLabel}>Kode terima paket</Text>
                        <TextInput
                            value={sendCode}
                            onChangeText={(t) =>
                                setSendCode(t.toUpperCase())
                            }
                            placeholder="Contoh: WSABC123XY"
                            placeholderTextColor={colors.textMuted}
                            style={[s.confirmInput, s.confirmInputCode]}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            maxLength={20}
                            editable={!submitting}
                        />
                        <Text style={s.confirmHint}>
                            Minta kode ini ke penerima. Kode dikirim customer
                            ke penerima saat order dibuat.
                        </Text>

                        <Pressable
                            disabled={
                                !receivedBy.trim() ||
                                !sendCode.trim() ||
                                submitting
                            }
                            style={[
                                s.confirmBtn,
                                {
                                    opacity:
                                        receivedBy.trim() &&
                                            sendCode.trim() &&
                                            !submitting
                                            ? 1
                                            : 0.5,
                                },
                            ]}
                            onPress={handleConfirmDelivery}
                        >
                            {submitting ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                />
                            ) : (
                                <Text style={s.confirmBtnText}>Kirim</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const s = StyleSheet.create({
    stopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    stopIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stopName: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    stopAddr: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    card: {
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 12,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#FAFBFC',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    cardIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: '800',
        color: colors.text,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    cardBody: { padding: 12 },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: 10,
    },
    cardName: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
    },
    cardPhone: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    cardMuted: {
        fontSize: 12,
        color: colors.textMuted,
        fontStyle: 'italic',
        marginTop: 2,
    },
    cardLabel: {
        fontSize: 11,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.2,
    },
    cardValue: {
        fontSize: 13,
        color: colors.text,
        marginTop: 3,
        lineHeight: 18,
    },
    cardLandmark: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 4,
        fontStyle: 'italic',
    },

    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
    },
    cardRating: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },

    pkgRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    pkgLabel: { fontSize: 13, color: colors.textMuted },
    pkgValue: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.text,
    },
    pkgBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    pkgBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
    },

    chatBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
        backgroundColor: '#E53935',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#fff',
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    dim: { opacity: 0.4 },
    callSmsRow: {
        flexDirection: 'row',
        marginTop: 10,
    },
    callSmsCol: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#F5F6F8',
        marginHorizontal: 2,
    },
    callSmsText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: 10,
    },
    destDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#f26b21',
    },

    photoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },
    photoHeaderTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    photoTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 4,
    },
    photoSub: {
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: 16,
    },
    photoRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    photoBoxWrap: {
        flex: 1,
        aspectRatio: 1.3,
        borderRadius: 12,
        overflow: 'hidden',
    },
    photoBox: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.field,
    },
    photoBadge: {
        position: 'absolute',
        right: 8,
        bottom: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoNote: {
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 18,
    },

    photoPreviewWrap: {
        width: '100%',
        aspectRatio: 4 / 3,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: colors.field,
        marginBottom: 12,
    },
    photoPreview: {
        width: '100%',
        height: '100%',
    },
    photoOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    photoOverlayText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    photoRetakeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: '#fff',
    },
    photoRetakeText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },

    photoBtn: {
        height: 54,
        borderRadius: 27,
        backgroundColor: '#1AA260',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
    },
    photoBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    confirmSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: 20,
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    confirmDividerFull: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: 14,
        marginHorizontal: -20,
    },
    confirmDesc: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 19,
        marginBottom: 20,
    },
    confirmLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 8,
    },
    confirmInput: {
        borderBottomWidth: 1,
        borderColor: colors.border,
        fontSize: 15,
        color: colors.text,
        paddingBottom: 8,
        marginBottom: 24,
    },
    confirmInputCode: {
        letterSpacing: 2,
        fontWeight: '800',
        fontSize: 17,
        textTransform: 'uppercase',
    },
    confirmHint: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: -16,
        marginBottom: 24,
        lineHeight: 17,
    },
    confirmBtn: {
        height: 54,
        borderRadius: 27,
        backgroundColor: '#1AA260',
        alignItems: 'center',
        justifyContent: 'center',
    },
    confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});