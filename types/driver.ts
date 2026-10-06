// types/driver.ts

// ============================================================
// BASE TYPES
// ============================================================
export type OrderType = 'ride' | 'send' | 'food';

export type Coords = {
    latitude: number;
    longitude: number;
};

export type OrderStop = {
    name: string;
    address: string;
    coords: Coords;
    landmark?: string;
};

export type MenuItem = {
    menu_item_id?: number;
    name: string;
    variant?: string;
    qty: number;
    price: number;
};

// ============================================================
// DRIVER ORDER
// ============================================================
export type DriverOrder = {
    id: string;
    type: OrderType;

    // ── Customer info ──
    customerName: string;
    customerRating: number | null;
    customerReviews: number;
    customerAvatar?: string;

    // ── Route ──
    pickup: OrderStop;
    dropoff: OrderStop;

    // ── Trip ──
    distanceKm: number;
    durationMin?: number;         // ⬅️ TAMBAH
    fare: number;                 // pendapatan driver (driver_earning)

    // ── Pricing (untuk food) ──
    subtotal?: number;            // ⬅️ TAMBAH: subtotal item food
    deliveryFee?: number;         // ⬅️ TAMBAH: ongkir
    totalFare?: number;           // ⬅️ TAMBAH: total yang dibayar customer
    paymentMethod?: string;       // ⬅️ TAMBAH: 'cash' | 'wallet' | 'qris'

    // ── Order meta ──
    orderCode?: string;           // ⬅️ TAMBAH
    note?: string;
    tariffCode?: string;          // ⬅️ TAMBAH: 'warjek_s', 'warfood', dll
    optionName?: string;          // ⬅️ TAMBAH: 'WarJek S', 'WarFood', dll

    // ── Khusus WarFood ──
    items?: MenuItem[];
    packagingFee?: number;
    restaurantLabel?: string;
    payAtRestaurant?: number;
    driverDeposit?: number;

    // ── Khusus WarSend ──
    receiverName?: string;
    receiverPhone?: string;
    senderPhone?: string;
    senderName?: string;          // ⬅️ TAMBAH
    packageType?: string;         // ⬅️ TAMBAH
    packageSize?: string;         // ⬅️ TAMBAH
    packageWeight?: string;       // ⬅️ TAMBAH
    packagePhotoUrl?: string;     // ⬅️ TAMBAH
    sendCode?: string;            // ⬅️ TAMBAH (kode terima paket)
};

// ============================================================
// ORDER BRAND (untuk UI)
// ============================================================
export const ORDER_BRAND: Record<
    OrderType,
    { label: string; color: string; icon: string }
> = {
    ride: {
        label: 'WarJek',
        color: '#40a3ea',
        icon: 'bicycle',
    },
    food: {
        label: 'WarFood',
        color: '#e68515',
        icon: 'fast-food',
    },
    send: {
        label: 'WarSend',
        color: '#1AAD5B',
        icon: 'cube',
    },
};