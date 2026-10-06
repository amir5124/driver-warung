// lib/activeOrderStore.ts
import type { DriverOrder } from '@/types/driver';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@active_order';

// ============================================================
// In-memory store + listener pattern
// ============================================================
type Listener = (order: DriverOrder | null) => void;

let currentOrder: DriverOrder | null = null;
const listeners = new Set<Listener>();

function notify() {
    listeners.forEach((fn) => fn(currentOrder));
}

// ============================================================
// Public API
// ============================================================
export const activeOrderStore = {
    /**
     * Ambil order aktif saat ini (sinkron, dari memory).
     */
    get(): DriverOrder | null {
        return currentOrder;
    },

    /**
     * Simpan / ganti order aktif. `null` untuk clear.
     * Otomatis persist ke AsyncStorage.
     */
    async set(order: DriverOrder | null): Promise<void> {
        currentOrder = order;
        notify();
        try {
            if (order) {
                await AsyncStorage.setItem(KEY, JSON.stringify(order));
            } else {
                await AsyncStorage.removeItem(KEY);
            }
        } catch (err) {
            console.warn('[activeOrderStore] persist error:', err);
        }
    },

    /**
     * Hydrate dari AsyncStorage saat app start.
     */
    async hydrate(): Promise<DriverOrder | null> {
        try {
            const raw = await AsyncStorage.getItem(KEY);
            if (raw) {
                currentOrder = JSON.parse(raw) as DriverOrder;
                notify();
            }
        } catch (err) {
            console.warn('[activeOrderStore] hydrate error:', err);
        }
        return currentOrder;
    },

    /**
     * Clear order aktif (dipanggil setelah selesai / cancel).
     */
    async clear(): Promise<void> {
        await activeOrderStore.set(null);
    },

    /**
     * Subscribe perubahan. Return unsubscribe function.
     */
    subscribe(fn: Listener): () => void {
        listeners.add(fn);
        // langsung kirim state saat ini
        fn(currentOrder);
        return () => {
            listeners.delete(fn);
        };
    },
};