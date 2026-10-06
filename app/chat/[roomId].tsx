import Avatar from '@/components/Avatar';
import { colors } from '@/constants/ojek-theme';
import { api, ChatMessage, getToken } from '@/lib/api';
import { supabase } from '@/lib/supabase-client';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const GREEN = '#43A74F';
const BG = '#F5F5F5';
const BUBBLE_THEIRS = '#E6E6E6';

export default function ChatScreen() {
    const insets = useSafeAreaInsets();
    const { roomId, peerName, peerAvatar } = useLocalSearchParams<{
        roomId: string;
        peerName?: string;
        peerAvatar?: string;
    }>();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [myId, setMyId] = useState<string | null>(null);
    const listRef = useRef<FlatList<ChatMessage>>(null);
    const channelRef = useRef<any>(null);
    const myIdRef = useRef<string | null>(null);
    const roomIdNum = Number(roomId);

    // ============================================================
    // 🆕 State untuk peer info (dari params + fetch)
    // ============================================================
    const [peerInfo, setPeerInfo] = useState<{
        name: string;
        avatarUrl: string | null;
    }>({
        name: peerName ?? 'Chat',
        avatarUrl: peerAvatar ?? null,
    });

    // ============================================================
    // Alert bottom sheet
    // ============================================================
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');
    const [alertAction, setAlertAction] = useState<(() => void) | null>(null);
    const [alertActionLabel, setAlertActionLabel] = useState('Mengerti');

    const showAlert = (
        title: string,
        message: string,
        actionLabel?: string,
        onAction?: () => void
    ) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertActionLabel(actionLabel ?? 'Mengerti');
        setAlertAction(() => onAction ?? null);
        setTimeout(
            () => setAlertVisible(true),
            Platform.OS === 'ios' ? 300 : 0
        );
    };

    const closeAlert = () => {
        setAlertVisible(false);
        setAlertAction(null);
    };

    // Simpan myId ke ref supaya tidak trigger re-subscribe
    useEffect(() => {
        myIdRef.current = myId;
    }, [myId]);

    // Ambil user id dari token
    useEffect(() => {
        (async () => {
            try {
                const token = await getToken();
                if (!token) {
                    console.warn('[chat] tidak ada token');
                    return;
                }
                const payload = JSON.parse(atob(token.split('.')[1]));
                setMyId(payload.sub);
            } catch (err) {
                console.warn('[chat] gagal parse token:', err);
            }
        })();
    }, []);

    // ============================================================
    // 🆕 Fetch peer info dari backend (kalau belum ada di params)
    // ============================================================
    useEffect(() => {
        // Kalau sudah ada lengkap dari params, skip fetch
        if (peerName && peerAvatar) {
            setPeerInfo({
                name: peerName,
                avatarUrl: peerAvatar,
            });
            return;
        }

        // Kalau belum, fetch dari API
        let alive = true;
        (async () => {
            try {
                // Coba ambil dari room detail
                // (endpoint ini perlu ada di backend — atau fallback ke room list)
                const rooms = await api.chat.listRooms();
                const room = rooms.find((r) => r.id === roomIdNum);

                if (!alive || !room) return;

                console.log('[chat] Peer info dari API:', {
                    name: room.peer_name,
                    avatar: room.peer_avatar,
                });

                setPeerInfo({
                    name: room.peer_name ?? peerName ?? 'Chat',
                    avatarUrl: room.peer_avatar ?? peerAvatar ?? null,
                });
            } catch (err: any) {
                console.warn(
                    '[chat] Gagal fetch peer info:',
                    err?.message
                );
            }
        })();

        return () => {
            alive = false;
        };
    }, [roomIdNum, peerName, peerAvatar]);

    // Ambil ulang semua pesan (dipakai saat reconnect / app kembali aktif)
    const refetchMessages = async () => {
        try {
            const data = await api.chat.listMessages(roomIdNum);
            setMessages(data);
            api.chat.markRead(roomIdNum).catch(() => { });
        } catch (err: any) {
            console.warn('[chat] refetch gagal:', err.message);
        }
    };

    // Load pesan awal — dengan timeout
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout 10s')), 10000)
                );

                const data = (await Promise.race([
                    api.chat.listMessages(roomIdNum),
                    timeoutPromise,
                ])) as ChatMessage[];

                if (!alive) return;

                setMessages(data);

                api.chat.markRead(roomIdNum).catch((err) => {
                    console.warn('[chat] markRead gagal:', err.message);
                });
            } catch (err: any) {
                console.error('[chat] GAGAL LOAD:', err.message);
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [roomIdNum]);

    // Subscribe Supabase Realtime
    useEffect(() => {
        let firstSubscribe = true;

        const channel = supabase
            .channel(`chat:${roomIdNum}`)
            .on('broadcast', { event: 'new_message' }, ({ payload }) => {
                const newMsg = payload as ChatMessage;

                setMessages((prev) =>
                    prev.some((m) => m.id === newMsg.id)
                        ? prev
                        : [...prev, newMsg]
                );

                if (newMsg.sender_id !== myIdRef.current) {
                    api.chat.markRead(roomIdNum).catch(() => { });
                }
            })
            .subscribe((status, err) => {
                console.log('[chat] Realtime status:', status, err ?? '');

                if (status === 'SUBSCRIBED') {
                    if (firstSubscribe) {
                        firstSubscribe = false;
                    } else {
                        refetchMessages();
                    }
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [roomIdNum]);

    // Refetch saat app kembali ke foreground
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') refetchMessages();
        });
        return () => sub.remove();
    }, [roomIdNum]);

    // Auto-scroll
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(
                () => listRef.current?.scrollToEnd({ animated: true }),
                100
            );
        }
    }, [messages.length]);

    // ============================================================
    // Kirim Teks
    // ============================================================
    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending) return;

        setInput('');
        setSending(true);

        try {
            const sent = await api.chat.send(roomIdNum, text);

            setMessages((prev) => {
                if (prev.some((m) => m.id === sent.id)) return prev;
                return [...prev, sent];
            });
        } catch (err: any) {
            console.error('[chat] Gagal kirim:', err.message);
            setInput(text);
            showAlert('Gagal Kirim', err.message || 'Coba lagi.');
        } finally {
            setSending(false);
        }
    };

    // ============================================================
    // Pilih dari Galeri
    // ============================================================
    const handlePickFromLibrary = async () => {
        try {
            const perm =
                await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                showAlert(
                    'Izin dibutuhkan',
                    'Aktifkan akses galeri untuk kirim foto.',
                    'Mengerti'
                );
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
                exif: false,
            });

            if (result.canceled || !result.assets?.length) return;

            await uploadImage(result.assets[0]);
        } catch (err: any) {
            console.error('[chat] Gagal buka galeri:', err.message);
            showAlert('Gagal', err.message || 'Tidak bisa buka galeri.');
        }
    };

    // ============================================================
    // Ambil dari Kamera
    // ============================================================
    const handlePickFromCamera = async () => {
        try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
                showAlert(
                    'Izin dibutuhkan',
                    'Aktifkan akses kamera untuk ambil foto.',
                    'Mengerti'
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.8,
                exif: false,
            });

            if (result.canceled || !result.assets?.length) return;

            await uploadImage(result.assets[0]);
        } catch (err: any) {
            console.error('[chat] Gagal buka kamera:', err.message);
            showAlert('Gagal', err.message || 'Tidak bisa buka kamera.');
        }
    };

    // ============================================================
    // Upload Gambar ke Backend
    // ============================================================
    const uploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
        setUploading(true);

        try {
            const msg = await api.chat.sendImage(
                roomIdNum,
                asset.uri,
                asset.fileName ?? undefined,
                asset.mimeType ?? undefined
            );

            setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
        } catch (err: any) {
            console.error('[chat] Upload gagal:', err.message);
            showAlert('Gagal Kirim Foto', err.message || 'Coba lagi.');
        } finally {
            setUploading(false);
        }
    };

    // ============================================================
    // Modal Pilih Sumber Foto
    // ============================================================
    const [sourceModalVisible, setSourceModalVisible] = useState(false);

    const openSourcePicker = () => setSourceModalVisible(true);

    const pickFromGallery = () => {
        setSourceModalVisible(false);
        setTimeout(() => handlePickFromLibrary(), 250);
    };

    const pickFromCamera = () => {
        setSourceModalVisible(false);
        setTimeout(() => handlePickFromCamera(), 250);
    };

    const formatTime = (iso: string) =>
        new Date(iso).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
        });

    // ============================================================
    // Render Item
    // ============================================================
    const renderItem = ({ item }: { item: ChatMessage }) => {
        const mine = item.sender_id === myId;
        const isImage =
            item.message_type === 'image' && !!item.attachment_url;

        return (
            <View style={[s.msgRow, mine ? s.msgRowMine : s.msgRowTheirs]}>
                <View
                    style={[
                        s.bubble,
                        mine ? s.bubbleMine : s.bubbleTheirs,
                        isImage && s.bubbleImage,
                    ]}
                >
                    {isImage ? (
                        <View>
                            <Image
                                source={{ uri: item.attachment_url! }}
                                style={s.imageMsg}
                                resizeMode="cover"
                            />
                            <View style={s.imageTimeWrap}>
                                <Text style={s.imageTime}>
                                    {formatTime(item.created_at)}
                                </Text>
                                {mine && (
                                    <Ionicons
                                        name="checkmark-done"
                                        size={14}
                                        color="#fff"
                                        style={{ marginLeft: 4 }}
                                    />
                                )}
                            </View>
                        </View>
                    ) : (
                        <>
                            <Text
                                style={[
                                    s.msgText,
                                    mine && s.msgTextMine,
                                ]}
                            >
                                {item.message}
                            </Text>
                            <View style={s.metaRow}>
                                <Text
                                    style={[
                                        s.msgTime,
                                        mine && s.msgTimeMine,
                                    ]}
                                >
                                    {formatTime(item.created_at)}
                                </Text>
                                {mine && (
                                    <Ionicons
                                        name="checkmark-done"
                                        size={15}
                                        color="rgba(255,255,255,0.85)"
                                        style={{ marginLeft: 4 }}
                                    />
                                )}
                            </View>
                        </>
                    )}
                </View>
            </View>
        );
    };

    const hasText = input.trim().length > 0;

    return (
        <SafeAreaView style={s.container} edges={['top', 'bottom']}>
            {/* ============================================================
                HEADER — pakai Avatar + nama dinamis
            ============================================================ */}
            <View style={s.header}>
                <Pressable
                    onPress={() => router.back()}
                    style={s.backBtn}
                    hitSlop={8}
                >
                    <Ionicons
                        name="arrow-back"
                        size={24}
                        color="#9AA0A6"
                    />
                </Pressable>

                {/* 🆕 Pakai Avatar component (foto atau inisial) */}
                <Avatar
                    uri={peerInfo.avatarUrl}
                    name={peerInfo.name}
                    size={46}
                    backgroundColor={GREEN}
                />

                <View style={{ flex: 1 }}>
                    <Text style={s.headerTitle} numberOfLines={1}>
                        {peerInfo.name}
                    </Text>
                    <Text style={s.headerSub} numberOfLines={1}>
                        Online
                    </Text>
                </View>
            </View>

            {/* Messages + Input */}
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior="height"
            >
                {loading ? (
                    <View style={s.loadingWrap}>
                        <ActivityIndicator color={GREEN} />
                        <Text style={s.loadingText}>
                            Memuat pesan...
                        </Text>
                    </View>
                ) : messages.length === 0 ? (
                    <View style={s.emptyWrap}>
                        <Ionicons
                            name="chatbubble-outline"
                            size={48}
                            color={colors.textMuted}
                        />
                        <Text style={s.emptyText}>
                            Belum ada pesan. Mulai percakapan!
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={(m) => String(m.id)}
                        renderItem={renderItem}
                        style={{ backgroundColor: BG }}
                        contentContainerStyle={{
                            padding: 16,
                            gap: 14,
                            paddingBottom: 12,
                        }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {/* Input card */}
                <View
                    style={[
                        s.inputWrap,
                        { paddingBottom: insets.bottom > 0 ? 8 : 12 },
                    ]}
                >
                    <View style={s.inputCard}>
                        <TextInput
                            value={input}
                            onChangeText={setInput}
                            placeholder="Ketik pesan..."
                            placeholderTextColor="#A0A4A8"
                            style={s.input}
                            multiline
                            maxLength={500}
                        />

                        <View style={s.inputActions}>
                            <Pressable
                                onPress={openSourcePicker}
                                disabled={uploading}
                                hitSlop={8}
                                style={[
                                    s.plusBtn,
                                    uploading && { opacity: 0.5 },
                                ]}
                            >
                                {uploading ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#8A8F94"
                                    />
                                ) : (
                                    <Ionicons
                                        name="add-circle-outline"
                                        size={32}
                                        color="#8A8F94"
                                    />
                                )}
                            </Pressable>

                            <Pressable
                                onPress={handleSend}
                                disabled={!hasText || sending}
                                style={[
                                    s.sendBtn,
                                    hasText && s.sendBtnActive,
                                ]}
                            >
                                {sending ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#fff"
                                    />
                                ) : (
                                    <Ionicons
                                        name="send"
                                        size={20}
                                        color="#fff"
                                    />
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {/* Loading Upload */}
            <Modal
                animationType="fade"
                transparent
                visible={uploading}
                onRequestClose={() => { }}
            >
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={GREEN} />

                    </View>
                </View>
            </Modal>

            {/* Pilih Sumber Foto */}
            <Modal
                visible={sourceModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setSourceModalVisible(false)}
            >
                <Pressable
                    style={styles.sourceOverlay}
                    onPress={() => setSourceModalVisible(false)}
                >
                    <Pressable
                        style={styles.sourceSheet}
                        onPress={() => { }}
                    >
                        <View style={styles.sourceHandle} />
                        <Text style={styles.sourceTitle}>
                            Kirim Foto
                        </Text>

                        <Pressable
                            style={styles.sourceOption}
                            onPress={pickFromCamera}
                        >
                            <View style={styles.sourceIconWrap}>
                                <Ionicons
                                    name="camera"
                                    size={22}
                                    color={GREEN}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sourceOptionLabel}>
                                    Ambil Foto
                                </Text>
                                <Text style={styles.sourceOptionSub}>
                                    Buka kamera dan jepret sekarang
                                </Text>
                            </View>
                            <Ionicons
                                name="chevron-forward"
                                size={18}
                                color={colors.textMuted}
                            />
                        </Pressable>

                        <Pressable
                            style={styles.sourceOption}
                            onPress={pickFromGallery}
                        >
                            <View style={styles.sourceIconWrap}>
                                <Ionicons
                                    name="images"
                                    size={22}
                                    color={GREEN}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.sourceOptionLabel}>
                                    Pilih dari Galeri
                                </Text>
                                <Text style={styles.sourceOptionSub}>
                                    Ambil foto yang sudah ada
                                </Text>
                            </View>
                            <Ionicons
                                name="chevron-forward"
                                size={18}
                                color={colors.textMuted}
                            />
                        </Pressable>

                        <Pressable
                            style={styles.sourceCancel}
                            onPress={() => setSourceModalVisible(false)}
                        >
                            <Text style={styles.sourceCancelText}>
                                Batal
                            </Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Alert Bottom Sheet */}
            <Modal
                visible={alertVisible}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={closeAlert}
            >
                <View style={styles.alertOverlay}>
                    <TouchableWithoutFeedback onPress={closeAlert}>
                        <View style={{ flex: 1 }} />
                    </TouchableWithoutFeedback>

                    <View style={styles.alertSheet}>
                        <TouchableOpacity
                            onPress={closeAlert}
                            style={styles.alertClose}
                        >
                            <Ionicons
                                name="close"
                                size={24}
                                color="#1c1c1c"
                            />
                        </TouchableOpacity>

                        <Text style={styles.alertTitle}>
                            {alertTitle}
                        </Text>
                        <Text style={styles.alertMessage}>
                            {alertMessage}
                        </Text>

                        <TouchableOpacity
                            onPress={() => {
                                const fn = alertAction;
                                closeAlert();
                                if (fn) setTimeout(fn, 200);
                            }}
                            style={styles.alertButton}
                        >
                            <Text style={styles.alertButtonText}>
                                {alertActionLabel}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // ---- Header ----
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: '#fff',
        gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    backBtn: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1c1c1c',
    },
    // 🆕 Subtitle
    headerSub: {
        fontSize: 12,
        color: '#43A74F',
        marginTop: 2,
        fontWeight: '600',
    },

    loadingWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: BG,
    },
    loadingText: { fontSize: 13, color: colors.textMuted },

    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        backgroundColor: BG,
    },
    emptyText: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
    },

    // ---- Bubbles ----
    msgRow: { flexDirection: 'row' },
    msgRowMine: { justifyContent: 'flex-end' },
    msgRowTheirs: { justifyContent: 'flex-start' },
    bubble: {
        maxWidth: '80%',
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 8,
        borderRadius: 20,
    },
    bubbleImage: {
        padding: 4,
        overflow: 'hidden',
    },
    bubbleMine: { backgroundColor: GREEN },
    bubbleTheirs: { backgroundColor: BUBBLE_THEIRS },
    msgText: { fontSize: 16, color: '#1c1c1c', lineHeight: 23 },
    msgTextMine: { color: '#fff' },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    msgTime: { fontSize: 12, color: '#7A7F84' },
    msgTimeMine: { color: 'rgba(255,255,255,0.85)' },

    imageMsg: {
        width: 220,
        height: 220,
        borderRadius: 16,
        backgroundColor: '#eee',
    },
    imageTimeWrap: {
        position: 'absolute',
        right: 8,
        bottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    imageTime: { color: '#fff', fontSize: 10, fontWeight: '600' },

    // ---- Input card ----
    inputWrap: {
        backgroundColor: BG,
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    inputCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingTop: 6,
        paddingBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
    },
    input: {
        maxHeight: 120,
        minHeight: 40,
        paddingHorizontal: 4,
        paddingVertical: 8,
        fontSize: 16,
        color: '#1c1c1c',
        textAlignVertical: 'top',
    },
    inputActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
    },
    plusBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#E8E8E8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnActive: {
        backgroundColor: GREEN,
    },
});

const styles = StyleSheet.create({
    // ---- Loading modal ----
    loadingOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        width: 100,
        padding: 20,
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
    loadingLabel: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 10,
        textAlign: 'center',
    },

    // ---- Source picker modal ----
    sourceOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sourceSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 32,
    },
    sourceHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c9ccd1',
        alignSelf: 'center',
        marginBottom: 16,
    },
    sourceTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 16,
    },
    sourceOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    sourceIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E9F9EF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sourceOptionLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
    sourceOptionSub: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    sourceCancel: {
        marginTop: 12,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#F1F3F5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sourceCancelText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },

    // ---- Alert bottom sheet ----
    alertOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    alertSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 32,
        paddingBottom: 50,
        position: 'relative',
    },
    alertClose: {
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
    alertTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 10,
    },
    alertMessage: {
        fontSize: 15,
        color: '#555',
        lineHeight: 22,
        marginBottom: 32,
    },
    alertButton: {
        width: '100%',
        borderRadius: 100,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: GREEN,
    },
    alertButtonText: {
        color: GREEN,
        fontWeight: '700',
        fontSize: 16,
    },
});