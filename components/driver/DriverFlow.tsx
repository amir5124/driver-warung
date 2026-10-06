// components/driver/DriverFlow.tsx
import AppAlert from '@/components/AppAlert';
import LoadingModal from '@/components/LoadingModal';
import { useUserLocation } from '@/hooks/use-user-location';
import { activeOrderStore } from '@/lib/activeOrderStore';
import { api } from '@/lib/api';
import { incomingOrderStore } from '@/lib/incomingOrderStore';
import { toDriverOrder } from '@/lib/order-utils';
import type { Coords, DriverOrder } from '@/types/driver';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import CustomerRatingStep from '../CustomerRatingStep';
import FoodTripStep from './FoodTripStep';
import HomeStep from './HomeStep';
import IncomingOrderModal from './IncomingOrderModal';
import RideTripStep from './RideTripStep';
import SendTripStep from './SendTripStep';

type Step = 'home' | 'trip';

type Props = {
    isOnline: boolean;
    onToggleOnline: (next: boolean) => void;
};

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

const FALLBACK_BASE: Coords = { latitude: -6.9021, longitude: 110.7543 };

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function DriverFlow({ isOnline, onToggleOnline }: Props) {
    const [step, setStep] = useState<Step>('home');
    const [incomingOrder, setIncomingOrder] = useState<DriverOrder | null>(null);
    const [activeOrder, setActiveOrder] = useState<DriverOrder | null>(null);
    const [activeOrderId, setActiveOrderId] = useState<number | null>(null);

    const [ratingOrder, setRatingOrder] = useState<DriverOrder | null>(null);
    const [pendingDoneMessage, setPendingDoneMessage] = useState<string>('');

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const seenIdsRef = useRef<Set<number>>(new Set());
    const cancelledOrderIdRef = useRef<number | null>(null);

    // Loading + Alert
    const [loading, setLoading] = useState(false);
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
    ) => {
        setAlertState({ visible: true, title, message, buttons });
    };

    const hideAlert = () => {
        setAlertState((a) => ({ ...a, visible: false }));
    };

    const location = useUserLocation();
    const baseCoordsRef = useRef<Coords>(FALLBACK_BASE);
    useEffect(() => {
        if (location.coords) baseCoordsRef.current = location.coords;
    }, [location.coords]);

    // Sembunyikan tab bar saat trip ATAU rating
    const navigation = useNavigation();
    useEffect(() => {
        const shouldHide = step === 'trip' || !!ratingOrder;
        navigation.setOptions({
            tabBarStyle: shouldHide ? { display: 'none' } : undefined,
        });
        return () => {
            navigation.setOptions({ tabBarStyle: undefined });
        };
    }, [step, ratingOrder, navigation]);

    // ═══════════════════════════════════════════════════════════
    // HIDRASI activeOrderStore
    // ═══════════════════════════════════════════════════════════
    useEffect(() => {
        let mounted = true;

        (async () => {
            const saved = await activeOrderStore.hydrate();
            if (!mounted) return;

            if (saved) {
                console.log('[DRIVER-FLOW] Resume order:', saved.id);
                setActiveOrder(saved);
                setActiveOrderId(Number(saved.id));
                setStep('trip');
            }
        })();

        const unsub = activeOrderStore.subscribe((o) => {
            if (!mounted) return;
            if (o && !activeOrder) {
                console.log('[DRIVER-FLOW] Store update:', o.id);
                setActiveOrder(o);
                setActiveOrderId(Number(o.id));
                setStep('trip');
            }
        });

        return () => {
            mounted = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ============================================================
    // TERIMA ORDER DARI NOTIFIKASI (new_order)
    // ============================================================
    useEffect(() => {
        const unsub = incomingOrderStore.subscribe((order) => {
            if (!order) return;

            if (
                order.status === 'cancelled' ||
                order.status === 'completed'
            ) {
                console.log(
                    '[DRIVER-FLOW] Skip order tidak aktif:',
                    order.id,
                    order.status
                );
                return;
            }

            console.log('[DRIVER-FLOW] Order dari notifikasi:', order.id);

            if (seenIdsRef.current.has(order.id)) {
                return;
            }
            seenIdsRef.current.add(order.id);

            setIncomingOrder(toDriverOrder(order, baseCoordsRef.current));
        });

        const pending = incomingOrderStore.get();

        if (
            pending &&
            pending.status !== 'cancelled' &&
            pending.status !== 'completed' &&
            !seenIdsRef.current.has(pending.id)
        ) {
            console.log('[DRIVER-FLOW] Pending order:', pending.id);
            seenIdsRef.current.add(pending.id);
            setIncomingOrder(toDriverOrder(pending, baseCoordsRef.current));
        }

        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ============================================================
    // POLLING REAL ORDER (listAvailable)
    // ============================================================
    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const fetchPendingOrders = useCallback(async () => {
        try {
            const list = await api.orders.listAvailable();
            const fresh = list.find((o) => !seenIdsRef.current.has(o.id));
            if (!fresh) return;

            seenIdsRef.current.add(fresh.id);
            console.log('[DRIVER-FLOW] Order baru polling:', {
                id: fresh.id,
                type: fresh.type,
            });

            setIncomingOrder(toDriverOrder(fresh, baseCoordsRef.current));
        } catch (err: any) {
            if (!String(err?.message).includes('Tidak bisa terhubung')) {
                console.warn(
                    '[DRIVER-FLOW] Fetch pending error:',
                    err.message
                );
            }
        }
    }, []);

    useEffect(() => {
        if (!isOnline) {
            stopPolling();
            setIncomingOrder(null);
            return;
        }

        console.log('[DRIVER-FLOW] Online → mulai polling');
        fetchPendingOrders();
        pollRef.current = setInterval(fetchPendingOrders, 5000);

        return () => {
            stopPolling();
        };
    }, [isOnline, fetchPendingOrders, stopPolling]);

    useEffect(() => () => stopPolling(), [stopPolling]);

    // ============================================================
    // POLLING STATUS ORDER AKTIF (deteksi cancel)
    // ============================================================
    useEffect(() => {
        if (!activeOrder || step !== 'trip') return;

        const orderId = Number(activeOrder.id);
        if (Number.isNaN(orderId)) return;

        let alive = true;
        let cancelled = false;

        const checkStatus = async () => {
            if (cancelled) return;
            try {
                const fresh = await api.orders.get(orderId);
                if (!alive) return;

                if (fresh.status === 'cancelled') {
                    cancelled = true;

                    if (cancelledOrderIdRef.current === orderId) {
                        return;
                    }
                    cancelledOrderIdRef.current = orderId;

                    console.log(
                        '[DRIVER-FLOW] Order cancelled:',
                        orderId
                    );

                    setActiveOrder(null);
                    setActiveOrderId(null);
                    setStep('home');
                    setIncomingOrder(null);
                    incomingOrderStore.set(null);
                    activeOrderStore.clear().catch(() => { });

                    showAlert(
                        'Orderan Dibatalkan',
                        fresh.cancellation_reason
                            ? `Alasan: ${fresh.cancellation_reason}`
                            : `Orderan dibatalkan oleh ${fresh.customer?.full_name ??
                            activeOrder.customerName ??
                            'Customer'
                            }`,
                        [{ text: 'OK' }]
                    );
                }
            } catch (err: any) {
                // Silent
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);

        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, [activeOrder?.id, step]);

    useEffect(() => {
        if (activeOrder) {
            cancelledOrderIdRef.current = null;
        }
    }, [activeOrder?.id]);

    // ============================================================
    // HANDLER TOGGLE ONLINE — dengan guard verifikasi
    // ============================================================
    const handleToggleOnline = useCallback(
        async (next: boolean) => {
            // Kalau mau online, cek verifikasi dulu
            if (next === true) {
                try {
                    const dp = await api.drivers.getMyProfile();
                    if (!dp.is_verified) {
                        showAlert(
                            'Akun Belum Terverifikasi',
                            'Upload dokumen verifikasi dulu (KTP, SIM, STNK) untuk bisa online.',
                            [
                                { text: 'Nanti', style: 'cancel' },
                                {
                                    text: 'Verifikasi',
                                    onPress: () =>
                                        router.push(
                                            '/verification' as any
                                        ),
                                },
                            ]
                        );
                        return;
                    }
                } catch (err: any) {
                    console.warn(
                        '[DRIVER-FLOW] Gagal cek verifikasi:',
                        err.message
                    );
                    // Lanjut — backend akan tolak kalau belum verified
                }
            }

            // Teruskan ke parent (DriverScreen) yang update state
            onToggleOnline(next);
        },
        [onToggleOnline]
    );

    // ============================================================
    // HANDLERS
    // ============================================================
    const handleAccept = async (order: DriverOrder) => {
        setIncomingOrder(null);
        setLoading(true);

        try {
            const orderId = Number(order.id);
            const res = await api.orders.accept(orderId);
            console.log('[DRIVER-FLOW] Order accepted:', res.id);

            const acceptedOrder = toDriverOrder(res, baseCoordsRef.current);
            setActiveOrderId(res.id);
            setActiveOrder(acceptedOrder);
            setStep('trip');
            cancelledOrderIdRef.current = null;

            await activeOrderStore.set(acceptedOrder);
        } catch (err: any) {
            console.warn('[DRIVER-FLOW] Gagal accept:', err.message);
            showAlert(
                'Gagal Terima Order',
                err?.message ?? 'Order mungkin sudah diambil driver lain.',
                [{ text: 'OK' }]
            );
        } finally {
            setLoading(false);
        }
    };

    const handleRejectOrExpire = (order: DriverOrder) => {
        setIncomingOrder(null);
        const orderId = Number(order.id);
        if (!Number.isNaN(orderId)) {
            seenIdsRef.current.add(orderId);
        }
    };

    const finishTrip = useCallback(
        (message: string) => {
            console.log('[DRIVER-FLOW] finishTrip:', message);

            const orderForRating = activeOrder;

            setPendingDoneMessage(message);
            if (orderForRating) {
                setRatingOrder(orderForRating);
            }

            setActiveOrder(null);
            setActiveOrderId(null);
            setStep('home');
            setIncomingOrder(null);
            incomingOrderStore.set(null);

            activeOrderStore.clear().catch((err) => {
                console.warn(
                    '[DRIVER-FLOW] Gagal clear store:',
                    err?.message
                );
            });

            if (!orderForRating) {
                showAlert('Selesai', message, [{ text: 'OK' }]);
            }
        },
        [activeOrder]
    );

    const handleTripExit = useCallback(
        (title: string, message: string) => {
            console.log('[DRIVER-FLOW] handleTripExit:', { title, message });

            setActiveOrder(null);
            setActiveOrderId(null);
            setStep('home');
            setRatingOrder(null);
            setPendingDoneMessage('');
            setIncomingOrder(null);
            incomingOrderStore.set(null);

            activeOrderStore.clear().catch(() => { });

            showAlert(title, message, [{ text: 'OK' }]);
        },
        []
    );

    const handleSendComplete = useCallback(
        async (receivedBy: string, sendCode: string) => {
            if (!activeOrder) {
                throw new Error('Tidak ada order aktif');
            }

            console.log('[DRIVER-FLOW] Send complete →', {
                orderId: activeOrder.id,
                receivedBy,
                sendCode,
            });

            try {
                const updated = await api.orders.updateStatus(
                    Number(activeOrder.id),
                    'completed',
                    undefined,
                    sendCode
                );

                console.log('[DRIVER-FLOW] Send completed:', updated.id);

                finishTrip(`Paket diterima oleh ${receivedBy}.`);
            } catch (err: any) {
                const msg = err?.message ?? '';

                if (
                    msg.includes('dibatalkan') ||
                    msg.includes('sudah selesai') ||
                    msg.includes('Tidak bisa ubah status')
                ) {
                    handleTripExit('Orderan Tidak Aktif', msg);
                    return;
                }

                throw err;
            }
        },
        [activeOrder, finishTrip, handleTripExit]
    );

    const handleRatingDone = useCallback(async () => {
        console.log('[DRIVER-FLOW] Rating selesai');

        setRatingOrder(null);

        if (pendingDoneMessage) {
            showAlert('Selesai', pendingDoneMessage, [{ text: 'OK' }]);
        }
        setPendingDoneMessage('');
    }, [pendingDoneMessage]);

    // ============================================================
    // CHAT
    // ============================================================
    const openChat = async () => {
        if (!activeOrderId) {
            showAlert('Chat', 'Belum ada order aktif.', [{ text: 'OK' }]);
            return;
        }

        setLoading(true);
        try {
            const room = await api.chat.openRoom(activeOrderId);
            router.push(
                `/chat/${room.id}?peerName=${encodeURIComponent(
                    activeOrder?.customerName ?? 'Customer'
                )}` as any
            );
        } catch (err: any) {
            showAlert('Gagal Buka Chat', err?.message ?? 'Coba lagi.', [
                { text: 'OK' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <>
            {step === 'home' && (
                <HomeStep
                    isOnline={isOnline}
                    onToggleOnline={handleToggleOnline}
                />
            )}

            {step === 'trip' && activeOrder?.type === 'ride' && (
                <RideTripStep
                    order={activeOrder}
                    onComplete={() =>
                        finishTrip('Perjalanan selesai, terima kasih!')
                    }
                    onCancelExit={handleTripExit}
                    onChat={openChat}
                />
            )}
            {step === 'trip' && activeOrder?.type === 'food' && (
                <FoodTripStep
                    order={activeOrder}
                    onComplete={() => finishTrip('Pesanan berhasil diantar!')}
                    onCancelExit={handleTripExit}
                    onChat={openChat}
                />
            )}
            {step === 'trip' && activeOrder?.type === 'send' && (
                <SendTripStep
                    order={activeOrder}
                    onComplete={handleSendComplete}
                    onCancelExit={handleTripExit}
                    onChat={openChat}
                />
            )}

            {ratingOrder && (
                <View style={StyleSheet.absoluteFillObject}>
                    <CustomerRatingStep
                        order={ratingOrder}
                        onDone={handleRatingDone}
                    />
                </View>
            )}

            <IncomingOrderModal
                order={incomingOrder}
                visible={!!incomingOrder && step === 'home' && !ratingOrder}
                durationSec={20}
                onAccept={handleAccept}
                onReject={handleRejectOrExpire}
                onExpire={handleRejectOrExpire}
            />

            <AppAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                buttons={alertState.buttons}
                onClose={hideAlert}
            />

            <LoadingModal visible={loading} />
        </>
    );
}