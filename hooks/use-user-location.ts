import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export type LatLng = {
    latitude: number;
    longitude: number;
};

// Lokasi default peta (Banyuwangi) sebelum lokasi driver berhasil didapat.
export const BANYUWANGI_REGION: LatLng = {
    latitude: -8.2192,
    longitude: 114.3691,
};

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied';

type UseUserLocationResult = {
    /** null selama belum granted / belum dapat fix pertama */
    coords: LatLng | null;
    status: LocationStatus;
    /** true hanya sekali, tepat saat fix pertama diterima — dipakai untuk trigger zoom */
    justGranted: boolean;
};

export function useUserLocation(): UseUserLocationResult {
    const [coords, setCoords] = useState<LatLng | null>(null);
    const [status, setStatus] = useState<LocationStatus>('idle');
    const [justGranted, setJustGranted] = useState(false);
    const watchRef = useRef<Location.LocationSubscription | null>(null);
    const hasEmittedFirstFix = useRef(false);

    useEffect(() => {
        let isMounted = true;

        const start = async () => {
            setStatus('requesting');

            // Izin biasanya sudah diminta di root layout saat app boot,
            // di sini cukup dibaca ulang (aman dipanggil lagi kalau belum).
            const { status: permStatus } = await Location.requestForegroundPermissionsAsync();

            if (!isMounted) return;

            if (permStatus !== 'granted') {
                setStatus('denied');
                return;
            }

            setStatus('granted');

            try {
                const current = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                });
                if (!isMounted) return;
                hasEmittedFirstFix.current = true;
                setCoords({
                    latitude: current.coords.latitude,
                    longitude: current.coords.longitude,
                });
                setJustGranted(true);
            } catch (err) {
                console.warn('Gagal mengambil lokasi awal driver:', err);
            }

            watchRef.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 4000,
                    distanceInterval: 10,
                },
                (update) => {
                    if (!isMounted) return;
                    const nextCoords = {
                        latitude: update.coords.latitude,
                        longitude: update.coords.longitude,
                    };
                    setCoords(nextCoords);

                    if (!hasEmittedFirstFix.current) {
                        hasEmittedFirstFix.current = true;
                        setJustGranted(true);
                    }
                }
            );
        };

        start();

        return () => {
            isMounted = false;
            watchRef.current?.remove();
        };
    }, []);

    // justGranted hanya perlu "menyala" sesaat; komponen pemakai yang
    // reset via useRef-nya sendiri setelah dipakai untuk animateToRegion.
    return { coords, status, justGranted };
}