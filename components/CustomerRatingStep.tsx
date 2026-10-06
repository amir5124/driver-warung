// @/components/driver/CustomerRatingStep.tsx
import { formatRupiah } from '@/constants/ojek-services';
import { colors } from '@/constants/ojek-theme';
import { api } from '@/lib/api';
import type { DriverOrder } from '@/types/driver';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
    order: DriverOrder;
    onDone: () => void;
};

const TAGS_GOOD = ['Ramah', 'Sopan', 'Tepat waktu', 'Lokasi jelas', 'Komunikatif'];
const TAGS_BAD = ['Sulit dihubungi', 'Lokasi tidak jelas', 'Kurang sopan', 'Bikin nunggu lama'];

const RATING_LABEL: Record<number, string> = {
    1: 'Sangat mengecewakan',
    2: 'Kurang memuaskan',
    3: 'Cukup baik',
    4: 'Baik',
    5: 'Sangat memuaskan',
};

// ============================================================
// Sub-komponen: Avatar
// ============================================================
function Avatar({ name, uri }: { name: string; uri?: string | null }) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [uri]);

    const initials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');

    if (uri && !failed) {
        return (
            <Image
                source={{ uri }}
                style={s.avatar}
                onError={() => setFailed(true)}
            />
        );
    }
    return (
        <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarText}>{initials || '?'}</Text>
        </View>
    );
}

// ============================================================
// Sub-komponen: Bintang
// ============================================================
function StarRating({
    value,
    onChange,
    disabled,
    size = 38,
}: {
    value: number;
    onChange?: (v: number) => void;
    disabled?: boolean;
    size?: number;
}) {
    return (
        <View style={s.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                    key={n}
                    onPress={() => !disabled && onChange?.(n)}
                    hitSlop={6}
                    disabled={disabled || !onChange}
                >
                    <Ionicons
                        name={n <= value ? 'star' : 'star-outline'}
                        size={size}
                        color={n <= value ? '#f5a623' : '#d8dce1'}
                        style={{ marginHorizontal: 4 }}
                    />
                </Pressable>
            ))}
        </View>
    );
}

// ============================================================
// MAIN
// ============================================================
export default function CustomerRatingStep({ order, onDone }: Props) {
    const insets = useSafeAreaInsets();
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [tags, setTags] = useState<string[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');

    // 🆕 Rating existing
    const [existingRating, setExistingRating] = useState<{
        rating: number;
        message: string | null;
        tags: string[];
    } | null>(null);
    const [checkingExisting, setCheckingExisting] = useState(true);

    // ============================================================
    // Data customer
    // ============================================================
    const [customer, setCustomer] = useState<{
        name: string;
        avatarUrl: string | null;
        rating: number | null;
        reviews: number;
    }>({
        name: order.customerName ?? 'Customer',
        avatarUrl: order.customerAvatar ?? null,
        rating: order.customerRating ?? null,
        reviews: order.customerReviews ?? 0,
    });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const fresh = await api.orders.get(Number(order.id));
                if (!alive || !fresh.customer) return;

                setCustomer((prev) => ({
                    name: fresh.customer?.full_name || prev.name,
                    avatarUrl: fresh.customer?.avatar_url ?? prev.avatarUrl,
                    rating: fresh.customer?.rating_avg ?? prev.rating,
                    reviews: fresh.customer?.total_reviews ?? prev.reviews,
                }));
            } catch (err: any) {
                console.warn('[CustomerRating] Gagal load order:', err?.message);
            }
        })();
        return () => {
            alive = false;
        };
    }, [order.id]);

    // ============================================================
    // 🆕 Cek rating existing
    // ============================================================
    useEffect(() => {
        let alive = true;
        (async () => {
            console.log('[CustomerRating] Cek existing rating untuk order:', order.id);
            try {
                const res = await api.orders.getRating(Number(order.id));
                console.log('[CustomerRating] Response:', res);

                if (!alive) return;

                if (res?.rating) {
                    setExistingRating({
                        rating: res.rating,
                        message: res.message ?? null,
                        tags: res.tags ?? [],
                    });
                }
            } catch (err: any) {
                console.log(
                    '[CustomerRating] Belum ada rating / gagal:',
                    err?.message
                );
            } finally {
                if (alive) setCheckingExisting(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [order.id]);

    const customerFirstName = customer.name.split(' ')[0] || 'customer';
    const hasReviews = customer.reviews > 0 && customer.rating != null;

    const showAlert = (title: string, msg: string) => {
        setAlertTitle(title);
        setAlertMessage(msg);
        setTimeout(() => setAlertVisible(true), Platform.OS === 'ios' ? 400 : 0);
    };

    const tagOptions = rating > 0 && rating <= 3 ? TAGS_BAD : TAGS_GOOD;

    const toggleTag = (t: string) => {
        if (submitting || submitted) return;
        setTags((prev) =>
            prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
        );
    };

    const handleSubmit = async () => {
        if (submitted || submitting) return;
        if (rating === 0) return;

        setSubmitting(true);
        try {
            await api.orders.rateCustomer(Number(order.id), {
                rating,
                message: message.trim() || undefined,
                tags,
            });
            setSubmitted(true);
            setTimeout(onDone, 600);
        } catch (err: any) {
            console.warn('[CustomerRating] Submit gagal:', err?.message);
            showAlert('Gagal Kirim', err?.message || 'Coba lagi sebentar lagi.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSkip = async () => {
        if (submitted || submitting) return;
        try {
            await api.orders.skipRating(Number(order.id));
        } catch (err) {
            console.warn('[CustomerRating] Skip gagal:', err);
        }
        onDone();
    };

    // ============================================================
    // LOADING STATE
    // ============================================================
    if (checkingExisting) {
        return (
            <View
                style={{
                    flex: 1,
                    backgroundColor: '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    // ============================================================
    // VIEW MODE — sudah ada rating
    // ============================================================
    if (existingRating && existingRating.rating > 0) {
        return (
            <View style={{ flex: 1, backgroundColor: '#fff' }}>
                <ScrollView
                    contentContainerStyle={{
                        paddingTop: insets.top + 24,
                        paddingBottom: insets.bottom + 24,
                        paddingHorizontal: 20,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View entering={FadeInUp.duration(300)} style={s.header}>
                        <View style={s.successCircle}>
                            <Ionicons name="checkmark" size={30} color="#fff" />
                        </View>
                        <Text style={s.headerTitle}>Ulasan sudah terkirim</Text>
                        <Text style={s.headerSub}>
                            Kamu sudah memberi ulasan untuk order ini
                        </Text>
                    </Animated.View>

                    {/* Route card */}
                    <View style={s.routeCard}>
                        <View style={s.routeRow}>
                            <View
                                style={[
                                    s.routeDot,
                                    { backgroundColor: colors.primary },
                                ]}
                            >
                                <Ionicons name="arrow-up" size={12} color="#fff" />
                            </View>
                            <Text style={s.routeText} numberOfLines={1}>
                                {order.pickup.name}
                            </Text>
                        </View>
                        <View style={s.routeLine} />
                        <View style={s.routeRow}>
                            <View
                                style={[
                                    s.routeDot,
                                    { backgroundColor: '#f26b21' },
                                ]}
                            >
                                <View style={s.routeDotInner} />
                            </View>
                            <Text style={s.routeText} numberOfLines={1}>
                                {order.dropoff.name}
                            </Text>
                        </View>

                        <View style={s.divider} />

                        <View style={s.fareRow}>
                            <Text style={s.fareLabel}>Pendapatan</Text>
                            <Text style={s.farePrice}>
                                {formatRupiah(order.fare)}
                            </Text>
                        </View>
                    </View>

                    {/* Customer card */}
                    <View style={s.driverRow}>
                        <Avatar name={customer.name} uri={customer.avatarUrl} />
                        <View style={{ flex: 1 }}>
                            <Text style={s.driverName} numberOfLines={1}>
                                {customer.name}
                            </Text>
                            <Text style={s.driverPlate} numberOfLines={1}>
                                {hasReviews
                                    ? `★ ${Number(customer.rating).toFixed(1)} • ${customer.reviews} ulasan`
                                    : 'Customer baru'}
                            </Text>
                        </View>
                    </View>

                    {/* Rating yang sudah diberikan */}
                    <View style={s.ratingViewCard}>
                        <Text style={s.ratingViewTitle}>Rating kamu</Text>

                        <StarRating value={existingRating.rating} size={32} />

                        <Text style={s.ratingViewLabel}>
                            {RATING_LABEL[existingRating.rating]}
                        </Text>

                        {existingRating.tags.length > 0 && (
                            <View style={s.ratingViewTags}>
                                {existingRating.tags.map((t) => (
                                    <View key={t} style={s.ratingViewTag}>
                                        <Text style={s.ratingViewTagText}>
                                            {t}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {existingRating.message ? (
                            <View style={s.ratingViewMessage}>
                                <Text style={s.ratingViewMessageLabel}>
                                    Pesan kamu
                                </Text>
                                <Text style={s.ratingViewMessageText}>
                                    "{existingRating.message}"
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    {/* Tombol selesai */}
                    <Pressable style={s.submitBtn} onPress={onDone}>
                        <Text style={s.submitText}>Selesai</Text>
                    </Pressable>
                </ScrollView>
            </View>
        );
    }

    // ============================================================
    // FORM MODE — belum ada rating
    // ============================================================
    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: '#fff' }}
            behavior="height"
        >
            <ScrollView
                contentContainerStyle={{
                    paddingTop: insets.top + 24,
                    paddingBottom: insets.bottom + 24,
                    paddingHorizontal: 20,
                }}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={FadeInUp.duration(300)} style={s.header}>
                    <View style={s.successCircle}>
                        <Ionicons name="checkmark" size={30} color="#fff" />
                    </View>
                    <Text style={s.headerTitle}>Order selesai!</Text>
                    <Text style={s.headerSub}>
                        Bantu kami menjaga kualitas layanan dengan menilai customer
                    </Text>
                </Animated.View>

                <View style={s.routeCard}>
                    <View style={s.routeRow}>
                        <View
                            style={[
                                s.routeDot,
                                { backgroundColor: colors.primary },
                            ]}
                        >
                            <Ionicons name="arrow-up" size={12} color="#fff" />
                        </View>
                        <Text style={s.routeText} numberOfLines={1}>
                            {order.pickup.name}
                        </Text>
                    </View>
                    <View style={s.routeLine} />
                    <View style={s.routeRow}>
                        <View
                            style={[
                                s.routeDot,
                                { backgroundColor: '#f26b21' },
                            ]}
                        >
                            <View style={s.routeDotInner} />
                        </View>
                        <Text style={s.routeText} numberOfLines={1}>
                            {order.dropoff.name}
                        </Text>
                    </View>

                    <View style={s.divider} />

                    <View style={s.fareRow}>
                        <Text style={s.fareLabel}>Pendapatan</Text>
                        <Text style={s.farePrice}>
                            {formatRupiah(order.fare)}
                        </Text>
                    </View>
                </View>

                <View style={s.driverRow}>
                    <Avatar name={customer.name} uri={customer.avatarUrl} />
                    <View style={{ flex: 1 }}>
                        <Text style={s.driverName} numberOfLines={1}>
                            {customer.name}
                        </Text>
                        <Text style={s.driverPlate} numberOfLines={1}>
                            {hasReviews
                                ? `★ ${Number(customer.rating).toFixed(1)} • ${customer.reviews} ulasan`
                                : 'Customer baru'}
                        </Text>
                    </View>
                </View>

                <View style={s.ratingSection}>
                    <Text style={s.ratingQuestion}>
                        Bagaimana pengalamanmu{'\n'}dengan {customerFirstName}?
                    </Text>
                    <StarRating
                        value={rating}
                        onChange={setRating}
                        disabled={submitting || submitted}
                    />
                    {rating > 0 && (
                        <Text style={s.ratingLabel}>{RATING_LABEL[rating]}</Text>
                    )}
                </View>

                {rating > 0 && (
                    <Animated.View entering={FadeInUp.duration(250)} style={s.tagWrap}>
                        {tagOptions.map((t) => {
                            const active = tags.includes(t);
                            return (
                                <Pressable
                                    key={t}
                                    onPress={() => toggleTag(t)}
                                    disabled={submitting || submitted}
                                    style={[s.tag, active && s.tagActive]}
                                >
                                    <Text
                                        style={[
                                            s.tagText,
                                            active && s.tagTextActive,
                                        ]}
                                    >
                                        {t}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </Animated.View>
                )}

                {rating > 0 && (
                    <Animated.View entering={FadeInUp.duration(250)}>
                        <TextInput
                            value={message}
                            onChangeText={setMessage}
                            placeholder="Tulis pesan untuk customer (opsional)"
                            placeholderTextColor={colors.textMuted}
                            multiline
                            editable={!submitting && !submitted}
                            style={s.input}
                        />
                    </Animated.View>
                )}

                <Pressable
                    disabled={rating === 0 || submitting || submitted}
                    onPress={handleSubmit}
                    style={[
                        s.submitBtn,
                        {
                            opacity:
                                rating === 0 || submitting || submitted ? 0.5 : 1,
                        },
                    ]}
                >
                    <Text style={s.submitText}>
                        {submitted ? 'Sudah terkirim' : 'Kirim ulasan'}
                    </Text>
                </Pressable>

                <Pressable
                    onPress={handleSkip}
                    disabled={submitting || submitted}
                    style={[s.skipBtn, (submitting || submitted) && { opacity: 0.5 }]}
                >
                    <Text style={s.skipText}>Lewati</Text>
                </Pressable>
            </ScrollView>

            <Modal
                animationType="fade"
                transparent
                visible={submitting}
                onRequestClose={() => { }}
            >
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                </View>
            </Modal>

            <Modal
                visible={alertVisible}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setAlertVisible(false)}
            >
                <View style={styles.sheetOverlay}>
                    <TouchableWithoutFeedback
                        onPress={() => setAlertVisible(false)}
                    >
                        <View style={{ flex: 1 }} />
                    </TouchableWithoutFeedback>
                    <View style={styles.sheetContainer}>
                        <TouchableOpacity
                            onPress={() => setAlertVisible(false)}
                            style={styles.sheetCloseButton}
                        >
                            <Ionicons name="close" size={24} color="#1c1c1c" />
                        </TouchableOpacity>
                        <Text style={styles.sheetTitle}>{alertTitle}</Text>
                        <Text style={styles.sheetDescription}>
                            {alertMessage}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setAlertVisible(false)}
                            style={styles.sheetButton}
                        >
                            <Text style={styles.sheetButtonText}>Mengerti</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
    header: { alignItems: 'center', marginBottom: 24 },
    successCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
    headerSub: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 4,
        textAlign: 'center',
        paddingHorizontal: 20,
    },

    routeCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 30 },
    routeDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    routeText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    routeLine: {
        height: 14,
        width: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginLeft: 10,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: 12,
    },
    fareRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    fareLabel: { fontSize: 13, color: colors.textMuted },
    farePrice: { fontSize: 16, fontWeight: '800', color: colors.text },

    driverRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#F5F6F8',
        marginBottom: 24,
    },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#dfe3e8' },
    avatarFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
    },
    avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    driverName: { fontSize: 15, fontWeight: '800', color: colors.text },
    driverPlate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

    ratingSection: { alignItems: 'center', marginBottom: 8 },
    ratingQuestion: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        textAlign: 'center',
        lineHeight: 22,
    },
    starRow: { flexDirection: 'row', marginTop: 16 },
    ratingLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
        marginTop: 10,
    },

    tagWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        marginTop: 20,
    },
    tag: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tagActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    tagText: { fontSize: 13, color: colors.text },
    tagTextActive: { color: colors.primary, fontWeight: '700' },

    input: {
        marginTop: 20,
        minHeight: 90,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 14,
        fontSize: 14,
        color: colors.text,
        textAlignVertical: 'top',
    },

    submitBtn: {
        height: 54,
        borderRadius: 27,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    skipBtn: { alignItems: 'center', paddingVertical: 16 },
    skipText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },

    // ============================================================
    // View mode (read-only rating)
    // ============================================================
    ratingViewCard: {
        backgroundColor: '#F5F6F8',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        alignItems: 'center',
    },
    ratingViewTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.textMuted,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    ratingViewLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.primary,
        marginTop: 12,
    },
    ratingViewTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        marginTop: 16,
    },
    ratingViewTag: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: colors.border,
    },
    ratingViewTagText: {
        fontSize: 12,
        color: colors.text,
        fontWeight: '600',
    },
    ratingViewMessage: {
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#fff',
        width: '100%',
    },
    ratingViewMessageLabel: {
        fontSize: 11,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        marginBottom: 4,
    },
    ratingViewMessageText: {
        fontSize: 14,
        color: colors.text,
        lineHeight: 20,
        fontStyle: 'italic',
    },
});

const styles = StyleSheet.create({
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
        color: colors.text,
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
        borderColor: colors.primary,
    },
    sheetButtonText: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 16,
    },
});