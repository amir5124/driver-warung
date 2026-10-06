// lib/api-driver.ts
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ?? `http://${DEV_HOST}:3000`;

console.log('[api-driver] ========== ENV CHECK ==========');
console.log('[api-driver] EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);
console.log('[api-driver] BASE_URL:', BASE_URL);
console.log('[api-driver] Platform.OS:', Platform.OS);
console.log('[api-driver] ================================');

const TOKEN_KEY = 'auth_token';

// ============================================================
// Token helpers
// ============================================================
export async function saveToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ============================================================
// Helper: deteksi MIME type dari nama file
// ============================================================
function guessMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
        case 'png':
            return 'image/png';
        case 'webp':
            return 'image/webp';
        case 'jpg':
        case 'jpeg':
        default:
            return 'image/jpeg';
    }
}

// ============================================================
// Types
// ============================================================

export interface AuthResponse {
    token: string;
    userId: string;
    role: 'customer' | 'driver' | 'merchant';
}

export interface ProfileResponse {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    role: 'customer' | 'driver' | 'merchant' | 'admin';
    avatar_url: string | null;
    fcm_token: string | null;
    created_at?: string;
}

export interface DriverProfile {
    user_id: string;
    vehicle_type: 'motor' | 'mobil' | null;
    plate_number: string | null;
    vehicle_brand: string | null;
    vehicle_model: string | null;
    sim_number: string | null;
    ktp_number: string | null;
    is_verified: boolean | null;
    status: 'offline' | 'online' | 'busy';
    rating_avg: number | null;
    total_trips: number | null;
    services: string[] | null;
    current_location: any;
    location_updated_at: string | null;
}

export interface OrderResponse {
    id: number;
    order_code: string;
    type: 'ride' | 'food' | 'send';
    status: 'pending' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
    customer_id: string;
    driver_id: string | null;
    merchant_id: string | null;

    // Pickup & dropoff
    pickup_name: string | null;
    pickup_address: string | null;
    pickup_coords?: { latitude: number; longitude: number } | null;
    dropoff_name: string | null;
    dropoff_address: string | null;
    dropoff_coords?: { latitude: number; longitude: number } | null;

    // Trip
    distance_km: number | null;
    duration_min: number | null;

    // Pricing
    total_fare: number;
    delivery_fee: number;
    driver_earning: number;
    subtotal?: number | null;              // ✅ TAMBAH
    packaging_fee?: number | null;         // ✅ TAMBAH
    discount?: number | null;              // ✅ TAMBAH
    admin_fee?: number | null;             // ✅ TAMBAH
    merchant_earning?: number | null;      // ✅ TAMBAH
    platform_earning?: number | null;      // ✅ TAMBAH

    payment_method: string;
    payment_status: string;
    notes: string | null;
    tariff_code?: string | null;
    option_name?: string | null;
    send_code?: string | null;

    // Contact info (WarSend)
    sender_name?: string | null;
    sender_phone?: string | null;
    sender_landmark?: string | null;
    receiver_name?: string | null;
    receiver_phone?: string | null;
    receiver_landmark?: string | null;

    // Package (WarSend)
    package_type?: string | null;
    package_size?: string | null;
    package_weight?: string | null;
    package_protection?: string | null;
    package_photo_url?: string | null;      // ✅ TAMBAH

    // Timestamps
    accepted_at?: string | null;
    arrived_at?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    cancelled_at?: string | null;
    cancellation_reason?: string | null;

    created_at: string;
    updated_at: string;

    // Items (WarFood)
    items?: Array<{
        id?: number;                        // ✅ TAMBAH
        menu_item_id?: number;
        name: string;
        variant?: string;
        qty: number;
        price: number;
        subtotal?: number;                  // ✅ TAMBAH
        notes?: string;                     // ✅ TAMBAH
    }> | null;

    customer?: {
        id: string;
        full_name: string | null;
        phone: string | null;
        avatar_url: string | null;
        rating_avg?: number | null;
        total_orders?: number | null;       // ✅ TAMBAH
        total_reviews?: number | null;
        stats?: {                            // ✅ TAMBAH
            total_orders: number;
            rating_avg: number | null;
            review_count: number;
        } | null;
    } | null;

    driver?: {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
        avatar_url: string | null;
        vehicle_type?: string | null;
        plate_number?: string | null;
        vehicle_brand?: string | null;
        rating_avg?: number | null;
        total_trips?: number | null;
        coords?: { latitude: number; longitude: number } | null;
    } | null;

    merchant?: {                             // ✅ TAMBAH
        user_id: string;
        store_name: string;
        address: string | null;
        logo_url: string | null;
    } | null;
}

export interface NearbyDriver {
    id: string;
    name: string;
    avatar_url: string | null;
    vehicle_type: 'motor' | 'mobil';
    plate_number: string | null;
    vehicle_brand: string | null;
    rating_avg: number;
    total_trips: number;
    distance_m: number;
    coords: { latitude: number; longitude: number } | null;
}

export interface CreateOrderPayload {
    type: 'ride' | 'food' | 'send';
    pickup_name: string;
    pickup_address: string;
    pickup_lat: number;
    pickup_lng: number;
    dropoff_name: string;
    dropoff_address: string;
    dropoff_lat: number;
    dropoff_lng: number;
    distance_km: number;
    duration_min?: number;
    payment_method?: 'cash' | 'wallet' | 'qris' | 'bank_transfer';
    notes?: string;
    merchant_id?: string;
    tariff_code?: string;
    option_name?: string;
    items?: Array<{
        menu_item_id: number;
        name: string;
        variant?: string;
        qty: number;
        price: number;
    }>;
    receiver_name?: string;
    receiver_phone?: string;
    sender_name?: string;
    sender_phone?: string;
    sender_landmark?: string;
    receiver_landmark?: string;
    package_type?: string;
    package_size?: 'kecil' | 'sedang' | 'besar';
    package_weight?: string;
    package_protection?: 'silver' | 'gold';
}

export interface ChatRoom {
    id: number;
    order_id: number;
    customer_id: string;
    driver_id: string | null;
    merchant_id: string | null;
    last_message_at: string | null;
    created_at: string;
}

export interface ChatMessage {
    id: number;
    room_id: number;
    sender_id: string;
    message: string | null;
    attachment_url: string | null;
    message_type: 'text' | 'image' | 'location';
    is_read: boolean;
    created_at: string;
}

export interface EarningsSummary {
    today: number;
    week: number;
    month: number;
    total: number;
    pending: number;

    // 🆕 Wallet
    balance: number;
    cash_debt: number;
    net_balance: number;
    total_commission_paid: number;
    total_commission_owed: number;
    pending_payout: number;
}

export interface EarningHistoryItem {
    id: number;
    order_code: string;
    type: string;
    pickup_name: string | null;
    dropoff_name: string | null;
    driver_earning: number;
    completed_at: string | null;
    tariff_code: string | null;
    option_name: string | null;

    // 🆕 Settlement
    commission_amount?: number | null;
    settlement_type?: 'cash' | 'gateway' | null;
    payment_method?: string | null;
}
/** Response untuk rating customer oleh driver */
export interface CustomerRatingResponse {
    ok: boolean;
    message?: string;
}

/** Response untuk cek rating yang pernah diberikan */
export interface ExistingCustomerRating {
    rating: number | null;
    message: string | null;
    tags: string[] | null;
    skipped: boolean;
}

// ============================================================
// 401 Handler — bisa dioverride dari luar
// ============================================================
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void) {
    onUnauthorized = fn;
}

// ============================================================
// Core request (JSON)
// ============================================================
async function request<T>(
    path: string,
    options: { method?: string; body?: any; auth?: boolean } = {}
): Promise<T> {
    const { method = 'GET', body, auth = false } = options;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (auth) {
        const token = await getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let res: Response;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (err: any) {
        console.warn('[api-driver] Network error:', err.message);
        throw new Error(
            'Tidak bisa terhubung ke server. Cek koneksi internet kamu.'
        );
    }

    // Hanya clear token kalau request DENGAN auth
    if (res.status === 401 && auth) {
        console.warn('[api-driver] 401 (auth request), clearing token');
        await clearToken();

        if (onUnauthorized) {
            onUnauthorized();
        } else {
            try {
                const { router } = await import('expo-router');
                router.replace('/(auth)/login' as any);
            } catch { }
        }

        throw new Error('Sesi habis, silakan login ulang.');
    }

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        throw new Error(`Server error (${res.status})`);
    }

    if (!res.ok || !json?.success) {
        const msg =
            json?.message ||
            (res.status === 401
                ? 'Email atau kata sandi salah.'
                : `Request failed (${res.status})`);
        throw new Error(msg);
    }
    return json.data as T;
}

// ============================================================
// Upload file (multipart/form-data)
// ============================================================
async function uploadFile<T>(
    path: string,
    fieldName: string,
    file: { uri: string; name: string; type: string }
): Promise<T> {
    const form = new FormData();
    form.append(fieldName, file as any);

    const headers: Record<string, string> = {};
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    // JANGAN set Content-Type manual — fetch auto-set multipart boundary

    let res: Response;
    try {
        res = await fetch(`${BASE_URL}${path}`, {
            method: 'POST',
            headers,
            body: form,
        });
    } catch (err: any) {
        console.warn('[api-driver] Upload network error:', err.message);
        throw new Error(
            'Tidak bisa terhubung ke server. Cek koneksi internet kamu.'
        );
    }

    if (res.status === 401) {
        console.warn('[api-driver] 401 Unauthorized (upload), clearing token');
        await clearToken();

        if (onUnauthorized) {
            onUnauthorized();
        } else {
            try {
                const { router } = await import('expo-router');
                router.replace('/login' as any);
            } catch { }
        }

        throw new Error('Sesi habis, silakan login ulang.');
    }

    let json: any = null;
    try {
        json = await res.json();
    } catch {
        throw new Error(`Server error (${res.status})`);
    }

    if (!res.ok || !json?.success) {
        throw new Error(json?.message || `Upload gagal (${res.status})`);
    }
    return json.data as T;
}

// ============================================================
// API
// ============================================================
export const api = {
    // ===== Auth =====
    register: (input: {
        email: string;
        password: string;
        full_name: string;
        role?: 'customer' | 'driver' | 'merchant';
    }) =>
        request<AuthResponse>('/api/auth/register', {
            method: 'POST',
            body: input,
        }),

    login: (input: { email: string; password: string }) =>
        request<AuthResponse>('/api/auth/login', {
            method: 'POST',
            body: input,
        }),

    me: () => request<ProfileResponse>('/api/auth/me', { auth: true }),

    // ===== Profile =====
    updateProfile: (input: {
        full_name?: string;
        phone?: string;
        email?: string;
        avatar_url?: string;
        fcm_token?: string;
    }) =>
        request<ProfileResponse>('/api/profiles/me', {
            method: 'PUT',
            body: input,
            auth: true,
        }),

    uploadAvatar: async (uri: string, mimeType = 'image/jpeg'): Promise<{
        avatar_url: string;
    }> => {
        const token = await getToken();
        const formData = new FormData();

        const name = uri.split('/').pop() ?? 'avatar.jpg';
        formData.append('image', {
            uri,
            name,
            type: mimeType,
        } as any);

        const res = await fetch(`${BASE_URL}/api/profiles/avatar`, {
            method: 'POST',
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: formData,
        });

        let json: any = null;
        try {
            json = await res.json();
        } catch {
            throw new Error(`Server error (${res.status})`);
        }

        if (!res.ok || !json?.success) {
            throw new Error(json?.message || 'Gagal upload foto');
        }
        return json.data;
    },

    getProfileById: (userId: string) =>
        request<ProfileResponse>(`/api/profiles/${userId}`, { auth: true }),

    // ===== Drivers =====
    drivers: {
        getMyProfile: () =>
            request<DriverProfile>('/api/drivers/profile', { auth: true }),

        updateLocation: (latitude: number, longitude: number) =>
            request<null>('/api/drivers/location', {
                method: 'PUT',
                body: { latitude, longitude },
                auth: true,
            }),

        getEarnings: () =>
            request<EarningsSummary>('/api/drivers/earnings', {
                auth: true,
            }),

        getEarningsHistory: (limit = 50, offset = 0) =>
            request<EarningHistoryItem[]>(
                `/api/drivers/earnings/history?limit=${limit}&offset=${offset}`,
                { auth: true }
            ),

        setStatus: (status: 'offline' | 'online' | 'busy') =>
            request<null>('/api/drivers/status', {
                method: 'PUT',
                body: { status },
                auth: true,
            }),

        updateServices: (services: string[]) =>
            request<DriverProfile>('/api/drivers/services', {
                method: 'PUT',
                body: { services },
                auth: true,
            }),

        updateVehicle: (input: {
            vehicle_type?: 'motor' | 'mobil';
            plate_number?: string;
            vehicle_brand?: string;
            vehicle_model?: string;
            sim_number?: string;
            ktp_number?: string;
        }) =>
            request<DriverProfile>('/api/drivers/profile', {
                method: 'PUT',
                body: input,
                auth: true,
            }),

        nearby: (lat: number, lng: number, radius = 5000, limit = 50) =>
            request<NearbyDriver[]>(
                `/api/drivers/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`,
                { auth: true }
            ),
    },

    // ===== 🆕 AUTO BID =====
    autobid: {
        /** Ambil config autobid */
        get: () =>
            request<{
                driver_id: string;
                is_enabled: boolean;
                max_radius_km: number;
                min_fare: number;
                services: string[];
                active_hours_start: string;
                active_hours_end: string;
                max_orders_per_hour: number;
                total_autobid_orders: number;
                last_autobid_at: string | null;
            } | null>('/api/drivers/autobid', { auth: true }),

        /** Update config autobid */
        update: (input: {
            is_enabled?: boolean;
            max_radius_km?: number;
            min_fare?: number;
            services?: string[];
            max_orders_per_hour?: number;
        }) =>
            request<any>('/api/drivers/autobid', {
                method: 'PUT',
                body: input,
                auth: true,
            }),

        /** Riwayat autobid */
        history: (limit = 50) =>
            request<
                Array<{
                    id: number;
                    order_id: number;
                    status: 'accepted' | 'skipped' | 'failed';
                    reason: string | null;
                    distance_km: number | null;
                    fare: number | null;
                    created_at: string;
                }>
            >(`/api/drivers/autobid/history?limit=${limit}`, { auth: true }),
    },


    // ===== 🆕 Wallet (topup + withdraw via LinkQu) =====
    wallet: {
        /** Info saldo + utang (driver) */
        get: () =>
            request<{
                balance: number;
                cash_debt: number;
                net_balance: number;
                total_earning: number;
                total_commission_paid: number;
                total_commission_owed: number;
                last_payout_at: string | null;
                updated_at: string;
            }>('/api/wallet', { auth: true }),

        /** Riwayat transaksi wallet driver */
        ledger: (limit = 50, offset = 0) =>
            request<
                Array<{
                    id: number;
                    driver_id: string;
                    order_id: number | null;
                    entry_type: string;
                    amount: number;
                    direction: 'in' | 'out';
                    balance_after: number;
                    cash_debt_after: number;
                    description: string | null;
                    metadata: any;
                    created_at: string;
                }>
            >(`/api/wallet/ledger?limit=${limit}&offset=${offset}`, { auth: true }),

        /** Riwayat pencairan (payout) */
        payouts: (limit = 20) =>
            request<
                Array<{
                    id: number;
                    driver_id: string;
                    amount: number;
                    status: string;
                    bank_code: string | null;
                    bank_name: string | null;
                    account_number: string | null;
                    account_name: string | null;
                    failure_reason: string | null;
                    requested_at: string;
                    completed_at: string | null;
                    created_at: string;
                }>
            >(`/api/wallet/payouts?limit=${limit}`, { auth: true }),

        /** Request pencairan saldo ke rekening bank */
        requestPayout: (input: {
            amount: number;
            bank_code: string;
            bank_name: string;
            account_number: string;
            account_name: string;
        }) =>
            request<any>('/api/wallet/payouts', {
                method: 'POST',
                body: input,
                auth: true,
            }),

        /** Topup — inquiry (buat VA / QRIS) */
        topupInquiry: (input: {
            amount: number;
            method: 'va' | 'qris';
            bank_code?: string;
        }) =>
            request<{
                partner_reff: string;
                virtual_account?: string;
                imageqris?: string;
                expired?: string;
                [key: string]: any;
            }>('/api/wallet/topup/inquiry', {
                method: 'POST',
                body: input,
                auth: true,
            }),

        /** Topup — cek status ke LinkQu */
        topupExecute: (partnerReff: string) =>
            request<any>('/api/wallet/topup/execute', {
                method: 'POST',
                body: { partner_reff: partnerReff },
                auth: true,
            }),

        /** Topup — status dari DB */
        topupStatus: (partnerReff: string) =>
            request<{
                id: number;
                user_id: string;
                partner_reff: string;
                method: 'va' | 'qris';
                amount: number;
                bank_code: string | null;
                va_number: string | null;
                qris_url: string | null;
                status: 'PENDING' | 'SUCCESS' | 'FAILED';
                expired_at: string | null;
                created_at: string;
            }>(`/api/wallet/topup/status/${partnerReff}`, { auth: true }),

        /** Withdraw — inquiry (validasi rekening + saldo) */
        withdrawInquiry: (input: {
            amount: number;
            bank_code: string;
            account_number: string;
        }) =>
            request<any>('/api/wallet/withdraw/inquiry', {
                method: 'POST',
                body: input,
                auth: true,
            }),

        /** Withdraw — execute (proses penarikan) */
        withdrawExecute: (inquiryReff: string) =>
            request<any>('/api/wallet/withdraw/execute', {
                method: 'POST',
                body: { inquiry_reff: inquiryReff },
                auth: true,
            }),

        /** Rekening tersimpan (maks 2) */
        savedAccounts: () =>
            request<
                Array<{
                    id: number;
                    user_id: string;
                    bank_code: string;
                    account_number: string;
                    account_name: string;
                    created_at: string;
                }>
            >('/api/wallet/saved-accounts', { auth: true }),

        saveAccount: (input: {
            bank_code: string;
            account_number: string;
            account_name: string;
        }) =>
            request<any>('/api/wallet/saved-accounts', {
                method: 'POST',
                body: input,
                auth: true,
            }),

        deleteAccount: (id: number) =>
            request<null>(`/api/wallet/saved-accounts/${id}`, {
                method: 'DELETE',
                auth: true,
            }),
    },

    // ===== Orders =====
    orders: {
        /**
         * List order yang tersedia untuk driver (status pending).
         */
        listAvailable: () =>
            request<OrderResponse[]>('/api/orders?status=pending', {
                auth: true,
            }),

        /** List order yang sedang dipegang driver (semua status) */
        listMine: (status?: string) =>
            request<OrderResponse[]>(
                `/api/orders${status ? `?status=${status}` : ''}`,
                { auth: true }
            ),

        /** Detail order */
        get: (orderId: number) =>
            request<OrderResponse>(`/api/orders/${orderId}`, {
                auth: true,
            }),

        /** Terima order */
        accept: (orderId: number) =>
            request<OrderResponse>(`/api/orders/${orderId}/accept`, {
                method: 'POST',
                auth: true,
            }),

        /**
         * Update status order.
         * @param orderId - id order
         * @param status - 'arrived' | 'in_progress' | 'completed' | 'cancelled'
         * @param reason - alasan kalau cancel
         * @param sendCode - kode terima paket (WAJIB untuk completed order 'send')
         */
        updateStatus: (
            orderId: number,
            status: 'arrived' | 'in_progress' | 'completed' | 'cancelled',
            reason?: string,
            sendCode?: string
        ) =>
            request<OrderResponse>(`/api/orders/${orderId}/status`, {
                method: 'PUT',
                body: { status, reason, send_code: sendCode },
                auth: true,
            }),

        /**
         * Driver menilai customer setelah order completed.
         * POST /api/orders/:id/rate-customer
         */
        rateCustomer: (
            orderId: number,
            payload: { rating: number; message?: string; tags?: string[] }
        ) =>
            request<CustomerRatingResponse>(
                `/api/orders/${orderId}/rate-customer`,
                {
                    method: 'POST',
                    body: payload,
                    auth: true,
                }
            ),

        /**
         * Driver skip menilai customer.
         * POST /api/orders/:id/skip-rating
         */
        skipRating: (orderId: number) =>
            request<CustomerRatingResponse>(
                `/api/orders/${orderId}/skip-rating`,
                {
                    method: 'POST',
                    auth: true,
                }
            ),

        /**
         * Ambil rating yang pernah diberikan driver untuk order tertentu.
         */
        getRating: (orderId: number) =>
            request<ExistingCustomerRating | null>(
                `/api/orders/${orderId}/rating`,
                { auth: true }
            ),
    },

    // ===== Chat =====
    chat: {
        /** Buka / buat room chat untuk order tertentu */
        openRoom: (orderId: number) =>
            request<ChatRoom>(`/api/chats/rooms/order/${orderId}`, {
                method: 'POST',
                auth: true,
            }),

        /** List pesan dalam room */
        listMessages: (roomId: number, limit = 100) =>
            request<ChatMessage[]>(
                `/api/chats/rooms/${roomId}/messages?limit=${limit}`,
                { auth: true }
            ),

        /** Kirim pesan teks */
        send: (
            roomId: number,
            message: string,
            type: 'text' | 'image' | 'location' = 'text'
        ) =>
            request<ChatMessage>(`/api/chats/rooms/${roomId}/messages`, {
                method: 'POST',
                body: { message, type },
                auth: true,
            }),

        /** Upload gambar ke chat room */
        sendImage: (
            roomId: number,
            uri: string,
            fileName?: string,
            mimeType?: string
        ) => {
            const name = fileName ?? uri.split('/').pop() ?? 'photo.jpg';
            const type = mimeType ?? guessMimeType(name);
            return uploadFile<ChatMessage>(
                `/api/chats/rooms/${roomId}/images`,
                'image',
                { uri, name, type }
            );
        },

        /** Tandai pesan sudah dibaca */
        markRead: (roomId: number) =>
            request<null>(`/api/chats/rooms/${roomId}/read`, {
                method: 'PUT',
                auth: true,
            }),

        /** List semua room chat driver */
        listRooms: () =>
            request<ChatRoom[]>('/api/chats/rooms', { auth: true }),
    },

    // ===== Notifications =====
    notifications: {
        list: () => request<any[]>('/api/notifications', { auth: true }),

        markRead: (id: number) =>
            request<null>(`/api/notifications/${id}/read`, {
                method: 'PUT',
                auth: true,
            }),
    },
};

// ============================================================
// Helper: fetchOrderDetail (legacy)
// ============================================================
export async function fetchOrderDetail(orderId: number): Promise<any> {
    const raw = await api.orders.get(orderId);
    return {
        id: raw.id,
        type: raw.type,
        pickup: {
            name: raw.pickup_name ?? '-',
            address: raw.pickup_address ?? '-',
        },
        dropoff: {
            name: raw.dropoff_name ?? '-',
            address: raw.dropoff_address ?? '-',
        },
        distanceKm: raw.distance_km ?? 0,
        fare: raw.driver_earning ?? raw.total_fare ?? 0,
        items:
            raw.type === 'food'
                ? (raw.items ?? []).map((it) => ({
                    name: it.name ?? 'Menu',
                    price: it.price ?? 0,
                    qty: it.qty ?? 1,
                    subtotal: (it.qty ?? 1) * (it.price ?? 0),   // ✅ TAMBAH
                }))
                : undefined,
    };
}