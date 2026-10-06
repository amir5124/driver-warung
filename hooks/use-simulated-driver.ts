import type { Coords } from '@/types/driver';
import { useEffect, useRef, useState } from 'react';

/**
 * Simulasikan posisi driver bergerak sepanjang `routeCoords` (hasil Directions API).
 * PENTING: `enabled` harus TRUE hanya setelah rute ASLI (multi-titik) didapat, bukan
 * saat routeCoords masih placeholder 2-titik (garis lurus) — kalau tidak, begitu rute
 * asli datang menggantikan placeholder, index akan reset dan motor "balik ke awal".
 */
export function useSimulatedDriver(routeCoords: Coords[], enabled: boolean, stepMs = 800) {
    const [index, setIndex] = useState(0);
    const routeRef = useRef(routeCoords);
    routeRef.current = routeCoords;

    // reset index HANYA kalau titik awal/akhir rute benar-benar berubah (ganti target/order),
    // bukan setiap kali reference array berubah (mis. re-fetch rute yang hasilnya sama)
    const routeKeyRef = useRef<string>('');
    useEffect(() => {
        const first = routeCoords[0];
        const last = routeCoords[routeCoords.length - 1];
        const key = first && last
            ? `${first.latitude},${first.longitude}-${last.latitude},${last.longitude}`
            : '';
        if (key !== routeKeyRef.current) {
            routeKeyRef.current = key;
            setIndex(0);
        }
    }, [routeCoords]);

    useEffect(() => {
        if (!enabled || routeRef.current.length < 2) return;

        const id = setInterval(() => {
            setIndex((i) => {
                const next = i + 1;
                return next >= routeRef.current.length ? i : next;
            });
        }, stepMs);

        return () => clearInterval(id);
    }, [enabled, stepMs, routeCoords.length]);

    const current: Coords | undefined = routeCoords.length > 0
        ? routeCoords[Math.min(index, routeCoords.length - 1)]
        : undefined;
    const nextPoint: Coords | undefined = routeCoords.length > 0
        ? routeCoords[Math.min(index + 1, routeCoords.length - 1)]
        : undefined;
    const done = index >= routeCoords.length - 1;

    return { coords: current, nextPoint, done };
}

export function bearingBetween(a: Coords, b: Coords): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}