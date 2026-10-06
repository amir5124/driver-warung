import AppAlert from '@/components/AppAlert';
import Avatar from '@/components/Avatar';
import LoadingModal from '@/components/LoadingModal';
import { colors } from '@/constants/ojek-theme';
import { api, type ChatRoomListItem } from '@/lib/api';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ============================================================
// Helpers
// ============================================================
const formatChatTime = (iso: string | null): string => {
    if (!iso) return '';

    const d = new Date(iso);
    const now = new Date();

    const dayDiff = Math.floor(
        (now.getTime() - d.getTime()) / 86400000
    );

    if (dayDiff === 0) {
        // Hari ini → jam:menit
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    if (dayDiff === 1) return 'Kemarin';

    if (dayDiff < 7) {
        const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        return days[d.getDay()];
    }

    // Lebih dari 7 hari
    const day = String(d.getDate()).padStart(2, '0');
    const month = [
        'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
        'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
    ][d.getMonth()];
    return `${day} ${month}`;
};

const previewMessage = (room: ChatRoomListItem): string => {
    if (room.last_message_type === 'image') return '📷 Foto';
    if (room.last_message_type === 'location') return '📍 Lokasi';
    return room.last_message || 'Belum ada pesan';
};

// ============================================================
// SCREEN
// ============================================================
export default function PesanScreen() {
    const insets = useSafeAreaInsets();

    const [rooms, setRooms] = useState<ChatRoomListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Alert state
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
    }>({
        visible: false,
        title: '',
        message: '',
    });

    const showAlert = (title: string, message: string) => {
        setAlertState({ visible: true, title, message });
    };

    const hideAlert = () => {
        setAlertState((a) => ({ ...a, visible: false }));
    };

    // ============================================================
    // Load chat rooms
    // ============================================================
    const loadRooms = useCallback(async () => {
        try {
            const data = await api.chat.listRooms();
            setRooms(data);
        } catch (err: any) {
            console.warn('[PESAN] Gagal load rooms:', err?.message);
            showAlert(
                'Gagal Memuat Pesan',
                err?.message ?? 'Coba lagi sebentar.'
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadRooms();
        }, [loadRooms])
    );

    const onRefresh = () => {
        setRefreshing(true);
        loadRooms();
    };

    // ============================================================
    // Open chat room
    // ============================================================
    const openRoom = (room: ChatRoomListItem) => {
        router.push(
            `/chat/${room.id}?peerName=${encodeURIComponent(
                room.peer_name
            )}` as any
        );
    };

    // ============================================================
    // Render item
    // ============================================================
    const renderItem = ({ item }: { item: ChatRoomListItem }) => {
        const hasMessage = !!item.last_message;

        return (
            <Pressable
                style={({ pressed }) => [
                    s.row,
                    pressed && { backgroundColor: '#F9FAFB' },
                ]}
                onPress={() => openRoom(item)}
            >
                {/* Avatar peer */}
                <Avatar
                    uri={item.peer_avatar}
                    name={item.peer_name}
                    size={44}
                    backgroundColor="#1AA260"
                />

                <View style={{ flex: 1 }}>
                    <View style={s.rowTop}>
                        <Text
                            style={s.name}
                            numberOfLines={1}
                        >
                            {item.peer_name}
                        </Text>
                        <Text style={s.time}>
                            {formatChatTime(item.last_message_at)}
                        </Text>
                    </View>

                    <Text
                        style={s.preview}
                        numberOfLines={1}
                    >
                        {previewMessage(item)}
                    </Text>
                </View>
            </Pressable>
        );
    };

    // ============================================================
    // Render
    // ============================================================
    return (
        <View
            style={{
                flex: 1,
                backgroundColor: '#fff',
                paddingTop: insets.top + 16,
            }}
        >
            {/* Header */}
            <View style={s.header}>
                <Text style={s.title}>Pesan</Text>
            </View>

            {/* List */}
            {rooms.length === 0 && !loading ? (
                <View style={s.emptyWrap}>
                    <View style={s.emptyIcon}>
                        <Ionicons
                            name="chatbubbles-outline"
                            size={40}
                            color={colors.textMuted}
                        />
                    </View>
                    <Text style={s.emptyTitle}>
                        Belum ada pesan
                    </Text>
                    <Text style={s.emptyDesc}>
                        Chat dengan customer akan muncul di sini
                        setelah kamu menerima order.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={rooms}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={['#1AA260']}
                            tintColor="#1AA260"
                        />
                    }
                    renderItem={renderItem}
                    ListEmptyComponent={null}
                />
            )}

            {/* Loading */}
            <LoadingModal visible={loading} />

            {/* Alert */}
            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={[{ text: 'OK' }]}
                onClose={hideAlert}
            />
        </View>
    );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
    header: { paddingHorizontal: 20, marginBottom: 12 },
    title: { fontSize: 22, fontWeight: '800', color: colors.text },

    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
    },

    rowTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    name: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
        flex: 1,
        marginRight: 8,
    },
    time: {
        fontSize: 11,
        color: colors.textMuted,
    },
    preview: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },

    // Empty state
    emptyWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        paddingBottom: 80,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EDEEF0',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 6,
    },
    emptyDesc: {
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
});