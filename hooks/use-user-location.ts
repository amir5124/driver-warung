import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export type LatLng = { latitude: number; longitude: number };

export type UserFix = LatLng & {
    accuracy: number | null; // meter
    heading: number | null;  // derajat
    speed: number | null;    // m/s
    timestamp: number;       // ms epoch dari perangkat
};

export const BANYUWANGI_REGION: LatLng = { latitude: -8.2192, longitude: 114.3691 };

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied';

const MAX_ACCURACY_M = 50;

export function useUserLocation() {
    const [coords, setCoords] = useState<LatLng | null>(null);
    const [fix, setFix] = useState<UserFix | null>(null);
    const [status, setStatus] = useState<LocationStatus>('idle');
    const [justGranted, setJustGranted] = useState(false);
    const watchRef = useRef<Location.LocationSubscription | null>(null);
    const hasEmittedFirstFix = useRef(false);

    useEffect(() => {
        let isMounted = true;

        const apply = (loc: Location.LocationObject) => {
            if (!isMounted) return;
            const acc = loc.coords.accuracy;
            // Setelah punya fix, buang pembacaan yang akurasinya jelek.
            if (hasEmittedFirstFix.current && acc != null && acc > MAX_ACCURACY_M) return;

            setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            setFix({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: acc ?? null,
                heading: loc.coords.heading ?? null,
                speed: loc.coords.speed ?? null,
                timestamp: loc.timestamp,
            });
            if (!hasEmittedFirstFix.current) {
                hasEmittedFirstFix.current = true;
                setJustGranted(true);
            }
        };

        const start = async () => {
            setStatus('requesting');
            const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
            if (!isMounted) return;
            if (permStatus !== 'granted') {
                setStatus('denied');
                return;
            }
            setStatus('granted');

            // Posisi cepat dari cache dulu, lalu diperhalus oleh fix baru.
            try {
                const last = await Location.getLastKnownPositionAsync({ maxAge: 30000, requiredAccuracy: MAX_ACCURACY_M });
                if (last) apply(last);
            } catch { }

            try {
                const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                apply(current);
            } catch (err) {
                console.warn('Gagal mengambil lokasi awal driver:', err);
            }

            const sub = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
                apply
            );
            if (!isMounted) {
                sub.remove(); // cegah kebocoran kalau sudah ditutup
                return;
            }
            watchRef.current = sub;
        };

        start();

        return () => {
            isMounted = false;
            watchRef.current?.remove();
        };
    }, []);

    return { coords, fix, status, justGranted };
}