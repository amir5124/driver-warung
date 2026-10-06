// lib/authState.ts
type Listener = (isLoggingOut: boolean) => void;

let isLoggingOut = false;
const listeners = new Set<Listener>();

export const authState = {
    setLoggingOut(v: boolean) {
        isLoggingOut = v;
        listeners.forEach((l) => l(v));
    },
    isLoggingOut() {
        return isLoggingOut;
    },
    subscribe(l: Listener) {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
};