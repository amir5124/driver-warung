import DriverFlow from '@/components/driver/DriverFlow';
import { api } from '@/lib/api';
import { Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';

export default function DriverScreen() {
    const [isOnline, setIsOnline] = useState(false);

    // ============================================================
    // Load status driver dari backend saat halaman fokus
    // ============================================================
    useFocusEffect(
        useCallback(() => {
            let alive = true;

            (async () => {
                try {
                    const driver = await api.drivers.getMyProfile();
                    if (!alive) return;

                    console.log(
                        '[BERANDA] Load status driver:',
                        driver.status
                    );
                    setIsOnline(driver.status === 'online');
                } catch (err: any) {
                    console.warn(
                        '[BERANDA] Gagal load status:',
                        err.message
                    );
                }
            })();

            return () => {
                alive = false;
            };
        }, [])
    );

    // ============================================================
    // Handler toggle online/offline (optimistic update)
    // ============================================================
    const handleToggleOnline = useCallback(async (next: boolean) => {
        console.log('[BERANDA] Toggle →', next ? 'online' : 'offline');

        // 1. Optimistic update (UI langsung berubah)
        setIsOnline(next);

        // 2. Sync ke backend
        try {
            await api.drivers.setStatus(next ? 'online' : 'offline');
            console.log('[BERANDA] Status updated di backend');
        } catch (err: any) {
            // 3. Rollback kalau gagal
            console.warn(
                '[BERANDA] Gagal update status:',
                err.message
            );
            setIsOnline(!next);
        }
    }, []);

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <DriverFlow
                isOnline={isOnline}
                onToggleOnline={handleToggleOnline}
            />
        </>
    );
}