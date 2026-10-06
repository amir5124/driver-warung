// constants/ojek-services.ts

// ============================================================
// FORMAT HELPERS
// ============================================================

/**
 * Format angka ke Rupiah.
 * Contoh: 25000 → "Rp 25.000"
 */
export function formatRupiah(value: number | string | null | undefined): string {
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    if (n == null || isNaN(Number(n))) return 'Rp 0';
    return 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');
}

/**
 * Format angka tanpa "Rp" (hanya angka dengan titik).
 * Contoh: 25000 → "25.000"
 */
export function formatNumber(value: number | string | null | undefined): string {
    const n = typeof value === 'string' ? parseInt(value, 10) : value;
    if (n == null || isNaN(Number(n))) return '0';
    return Math.round(Number(n)).toLocaleString('id-ID');
}

/**
 * Format jarak.
 * Contoh: 1200 → "1.2 km", 500 → "500 m"
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format durasi.
 * Contoh: 45 → "45 menit", 90 → "1 jam 30 menit"
 */
export function formatDuration(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)} menit`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}

// ============================================================
// SERVICE TYPES
// ============================================================

export type ServiceKey = 'ride' | 'food' | 'send' | 'car' | 'shop' | 'delivery';

export type ServiceDef = {
    key: ServiceKey;
    label: string;
    icon: string;
    color: string;
    description?: string;
};

export const OJEK_SERVICES: ServiceDef[] = [
    {
        key: 'ride',
        label: 'WarJek',
        icon: 'motorbike',
        color: '#40a3ea',
        description: 'Ojek motor cepat & murah',
    },
    {
        key: 'food',
        label: 'WarFood',
        icon: 'silverware-fork-knife',
        color: '#e5484d',
        description: 'Pesan makanan favoritmu',
    },
    {
        key: 'send',
        label: 'WarSend',
        icon: 'package-variant-closed',
        color: '#1AA260',
        description: 'Kirim paket & barang',
    },
    {
        key: 'car',
        label: 'WarCar',
        icon: 'car',
        color: '#2d2f36',
        description: 'Mobil dengan driver',
    },
];

// ============================================================
// SERVICE CONSTANTS (untuk tab filter di driver dll.)
// ============================================================

export const SERVICE_RIDE = 'ride';
export const SERVICE_FOOD = 'food';
export const SERVICE_SEND = 'send';

// ============================================================
// ORDER STATUS LABELS
// ============================================================

export const ORDER_STATUS_LABEL: Record<string, string> = {
    pending: 'Menunggu',
    accepted: 'Diterima',
    arrived: 'Tiba di lokasi',
    in_progress: 'Sedang berjalan',
    completed: 'Selesai',
    cancelled: 'Dibatalkan',
};

// ============================================================
// PAYMENT METHODS
// ============================================================

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: 'Tunai',
    wallet: 'Saldo Waruung',
    qris: 'QRIS',
    bank_transfer: 'Transfer Bank',
};

// ============================================================
// PACKAGE OPTIONS (WarSend)
// ============================================================

export const PACKAGE_SIZES = [
    { value: 'kecil', label: 'Kecil', desc: '≤ 5 kg' },
    { value: 'sedang', label: 'Sedang', desc: '5 - 15 kg' },
    { value: 'besar', label: 'Besar', desc: '> 15 kg' },
] as const;

export const PACKAGE_PROTECTIONS = [
    { value: 'silver', label: 'Silver', desc: 'Asuransi dasar' },
    { value: 'gold', label: 'Gold', desc: 'Asuransi penuh' },
] as const;

// ============================================================
// DEFAULT VALUES
// ============================================================

export const DEFAULT_FALLBACK_COORDS = {
    latitude: -6.9021,
    longitude: 110.7543,
};

export const DEFAULT_RADIUS_KM = 5;
export const DEFAULT_MAP_DELTA = 0.01;