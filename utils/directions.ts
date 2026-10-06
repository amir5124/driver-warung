import type { Coords } from '@/types/ojek';

/**
 * Decode Google's encoded polyline string jadi array koordinat.
 * Algoritma standar dari Google Maps Encoding docs.
 */
export function decodePolyline(encoded: string): Coords[] {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const coordinates: Coords[] = [];

    while (index < encoded.length) {
        let result = 1;
        let shift = 0;
        let b: number;

        do {
            b = encoded.charCodeAt(index++) - 63 - 1;
            result += b << shift;
            shift += 5;
        } while (b >= 0x1f);
        lat += result & 1 ? ~(result >> 1) : result >> 1;

        result = 1;
        shift = 0;
        do {
            b = encoded.charCodeAt(index++) - 63 - 1;
            result += b << shift;
            shift += 5;
        } while (b >= 0x1f);
        lng += result & 1 ? ~(result >> 1) : result >> 1;

        coordinates.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
    }

    return coordinates;
}

/**
 * Ambil rute driving (mengikuti jalan) dari Google Directions API antara dua titik.
 * Return null kalau gagal (network error / status bukan 'OK') — caller sebaiknya
 * fallback ke garis lurus [origin, destination] kalau ini null.
 */
export async function fetchDrivingRoute(
    origin: Coords,
    destination: Coords,
    apiKey: string
): Promise<Coords[] | null> {
    try {
        const url =
            `https://maps.googleapis.com/maps/api/directions/json` +
            `?origin=${origin.latitude},${origin.longitude}` +
            `&destination=${destination.latitude},${destination.longitude}` +
            `&mode=driving&key=${apiKey}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== 'OK' || !data.routes?.[0]?.overview_polyline?.points) {
            // status umum yang perlu diketahui: REQUEST_DENIED (Directions API belum
            // di-enable untuk key ini), ZERO_RESULTS, OVER_QUERY_LIMIT, dll.
            console.warn('Directions API gagal:', data.status, data.error_message);
            return null;
        }

        const points = decodePolyline(data.routes[0].overview_polyline.points);
        return points.length > 1 ? points : null;
    } catch (err) {
        console.warn('Fetch directions error:', err);
        return null;
    }
}