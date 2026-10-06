import type { OrderResponse } from '@/lib/api';

type Listener = (order: OrderResponse | null) => void;

let currentOrder: OrderResponse | null = null;
const listeners = new Set<Listener>();

export const incomingOrderStore = {
    set(order: OrderResponse | null) {
        currentOrder = order;
        listeners.forEach((l) => l(order));
    },
    get() {
        return currentOrder;
    },
    subscribe(l: Listener) {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
};