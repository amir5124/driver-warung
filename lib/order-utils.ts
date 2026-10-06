// lib/order-utils.ts
import type { Coords, DriverOrder } from '@/types/driver';
import type { OrderResponse } from './api-driver';

const FALLBACK_BASE: Coords = {
    latitude: -6.9021,
    longitude: 110.7543,
};

export function toDriverOrder(
    o: OrderResponse,
    driverBase: Coords = FALLBACK_BASE
): DriverOrder {
    const pickupCoords = o.pickup_coords ?? driverBase;
    const dropoffCoords = o.dropoff_coords ?? driverBase;

    const base: DriverOrder = {
        id: String(o.id),
        type:
            o.type === 'send'
                ? 'send'
                : o.type === 'food'
                    ? 'food'
                    : 'ride',
        customerName: o.customer?.full_name ?? 'Customer',
        customerRating: o.customer?.rating_avg ?? null,
        customerReviews: o.customer?.total_reviews ?? 0,
        customerAvatar: o.customer?.avatar_url ?? undefined,
        pickup: {
            name: o.pickup_name ?? 'Titik jemput',
            address: o.pickup_address ?? '',
            coords: pickupCoords,
        },
        dropoff: {
            name: o.dropoff_name ?? 'Tujuan',
            address: o.dropoff_address ?? '',
            coords: dropoffCoords,
        },
        distanceKm: o.distance_km ?? 0,
        durationMin: o.duration_min ?? 0,
        fare: o.driver_earning ?? o.delivery_fee ?? o.total_fare ?? 0,

        subtotal: (o as any).subtotal ?? 0,
        deliveryFee: o.delivery_fee ?? 0,
        totalFare: o.total_fare ?? 0,
        paymentMethod: o.payment_method ?? 'cash',

        orderCode: o.order_code ?? '',
        note: o.notes ?? undefined,
        tariffCode: o.tariff_code ?? undefined,
        optionName: o.option_name ?? undefined,
    };

    if (o.type === 'food') {
        const rawItems =
            (o as any).order_items ?? (o as any).items ?? [];

        console.log('[toDriverOrder] Food items:', rawItems.length);

        base.items = rawItems.map((i: any) => ({
            id: i.id,
            menu_item_id: i.menu_item_id,
            name: i.name,
            variant: i.variant,
            qty: Number(i.qty ?? 0),
            price: Number(i.price ?? 0),
            subtotal: Number(i.subtotal ?? (i.qty ?? 0) * (i.price ?? 0)),
            notes: i.notes,
        }));
        base.packagingFee = Number((o as any).packaging_fee ?? 0);
    }

    if (o.type === 'send') {
        base.receiverName = o.receiver_name ?? 'Penerima';
        base.receiverPhone = o.receiver_phone ?? '';
        base.senderPhone = o.sender_phone ?? '';
        base.senderName = (o as any).sender_name ?? '';
        base.packageType = (o as any).package_type ?? '';
        base.packageSize = (o as any).package_size ?? '';
        base.packageWeight = (o as any).package_weight ?? '';
        base.packagePhotoUrl = (o as any).package_photo_url ?? '';
        base.sendCode = (o as any).send_code ?? '';
    }

    return base;
}