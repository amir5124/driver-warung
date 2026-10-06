import { mapStyle } from '@/constants/ojek-map-style';
import { colors } from '@/constants/ojek-theme';
import { bearingBetween, useSimulatedDriver } from '@/hooks/use-simulated-driver';
import type { Coords } from '@/types/ojek';
import { fetchDrivingRoute } from '@/utils/directions';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAP_PROVIDER } from '../ojek/parts';

// ============================================================
// Asset icon driver per kendaraan
// ============================================================
const MOTOR_IMG = require('../../assets/images/motor-map.png');
const MOBIL_IMG = require('../../assets/images/mobil-map.png');
const KURIR_IMG = require('../../assets/images/kurir-map.png');

export type VehicleType = 'motor' | 'mobil' | 'send' | 'food';

const VEHICLE_ICONS: Record<VehicleType, any> = {
    motor: MOTOR_IMG,
    mobil: MOBIL_IMG,
    send: KURIR_IMG,
    food: KURIR_IMG,   // ← tambah: food pakai kurir-map.png
};

const DIRECTIONS_API_KEY: string =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    (Constants.expoConfig?.extra?.googleMapsApiKey as string | undefined) ||
    'AIzaSyCQOfitYRU7iAHMRaj0dwcrI8-UQIiFPWI';

// ============================================================
// 🔧 MODE SIMULASI
// - Default: false (produksi) → icon ikut GPS asli
// - Dev/demo: set EXPO_PUBLIC_SIMULATE_DRIVER=true di .env
// ============================================================
const SIMULATE_DRIVER =
    process.env.EXPO_PUBLIC_SIMULATE_DRIVER === 'true';

console.log(
    '[TripMapShell] MODULE LOADED | SIMULATE_DRIVER =',
    SIMULATE_DRIVER,
    '| raw env =',
    process.env.EXPO_PUBLIC_SIMULATE_DRIVER
);

// Warna untuk jalan yang sudah dilewati
const PASSED_COLOR = '#B0B7C3'; // abu-abu
const PASSED_BORDER = '#FFFFFF'; // border putih

// Threshold gerak minimal untuk update heading (derajat koordinat)
const HEADING_MOVE_THRESHOLD = 0.00001;

// Threshold off-route: kalau driver >100m dari route, refetch directions
const OFF_ROUTE_THRESHOLD_M = 100;

// 1 derajat ≈ 111 km (di lintang Indonesia)
const DEG_TO_METER = 111000;

type TargetMarkerType = 'pin' | 'account';

type Props = {
    driverCoords: Coords;
    targetCoords: Coords;
    targetColor: string;
    targetMarkerType?: TargetMarkerType;
    showEmergency?: boolean;
    emergencyLabel?: string;
    /** Dipanggil saat tombol darurat ditekan */
    onEmergency?: () => void;
    children: React.ReactNode;
    sheetHeight?: number;

    vehicleType?: VehicleType;
    passedIndex?: number;
    passedColor?: string;
    routeColor?: string;
};

// ============================================================
// Helper: cari index titik terdekat dari posisi driver di route
// ============================================================
function findNearestIndex(route: Coords[], pos: Coords): number {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
        const dLat = route[i].latitude - pos.latitude;
        const dLng = route[i].longitude - pos.longitude;
        const d = dLat * dLat + dLng * dLng;
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return bestIdx;
}

// ============================================================
// Helper: hitung jarak (meter) dari titik ke route terdekat
// ============================================================
function distanceToRouteM(route: Coords[], pos: Coords): number {
    if (route.length === 0) return Infinity;
    const idx = findNearestIndex(route, pos);
    const nearest = route[idx];
    const dLat = nearest.latitude - pos.latitude;
    const dLng = nearest.longitude - pos.longitude;
    return Math.sqrt(dLat * dLat + dLng * dLng) * DEG_TO_METER;
}

// ============================================================
// Helper: cek apakah dua koordinat dianggap "bergerak"
// ============================================================
function hasMoved(a: Coords | null, b: Coords): boolean {
    if (!a) return false;
    return (
        Math.abs(a.latitude - b.latitude) > HEADING_MOVE_THRESHOLD ||
        Math.abs(a.longitude - b.longitude) > HEADING_MOVE_THRESHOLD
    );
}

// ============================================================
// 🆕 Helper: buka Google Maps untuk navigasi ke target
// ============================================================
function openNavigationTo(
    target: Coords,
    label?: string
) {
    const { latitude, longitude } = target;
    const encodedLabel = label ? encodeURIComponent(label) : '';

    // URL scheme per platform
    const nativeUrl = Platform.select({
        ios: `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`,
        android: `google.navigation:q=${latitude},${longitude}&mode=d`,
    });

    // Fallback universal web URL
    const webUrl =
        `https://www.google.com/maps/dir/?api=1` +
        `&destination=${latitude},${longitude}` +
        `&travelmode=driving` +
        (encodedLabel ? `&destination_place_id=${encodedLabel}` : '');

    if (!nativeUrl) {
        Linking.openURL(webUrl).catch(() => {
            console.warn('[TripMapShell] Gagal buka Google Maps (web)');
        });
        return;
    }

    // Coba native app dulu, fallback ke web
    Linking.canOpenURL(nativeUrl)
        .then((supported) => {
            if (supported) {
                return Linking.openURL(nativeUrl);
            }
            return Linking.openURL(webUrl);
        })
        .catch(() => {
            Linking.openURL(webUrl).catch(() => {
                console.warn('[TripMapShell] Gagal buka maps');
            });
        });
}

export default function TripMapShell({
    driverCoords,
    targetCoords,
    targetColor,
    targetMarkerType = 'pin',
    showEmergency,
    emergencyLabel = 'DARURAT',
    onEmergency,
    children,
    sheetHeight = 260,

    vehicleType = 'motor',
    passedIndex: passedIndexProp,
    passedColor = PASSED_COLOR,
    routeColor,
}: Props) {
    const insets = useSafeAreaInsets();
    const mapRef = useRef<MapView>(null);

    const [routeCoords, setRouteCoords] = useState<Coords[]>([
        driverCoords,
        targetCoords,
    ]);
    const [motorReady, setMotorReady] = useState(false);
    const [measuredSheetHeight, setMeasuredSheetHeight] = useState(
        sheetHeight + insets.bottom + 24
    );

    const isRealRoute = routeCoords.length > 2;

    // ============================================================
    // 🔍 LOG: driverCoords update
    // ============================================================
    useEffect(() => {
        console.log('[TripMapShell] driverCoords:', {
            lat: driverCoords.latitude.toFixed(6),
            lng: driverCoords.longitude.toFixed(6),
            simulate: SIMULATE_DRIVER,
        });
    }, [driverCoords.latitude, driverCoords.longitude]);

    // ============================================================
    // 🎯 FETCH DIRECTIONS — Sekali, refetch hanya kalau off-route
    // ============================================================
    useEffect(() => {
        if (!driverCoords || !targetCoords) return;

        if (routeCoords.length > 2) {
            const distM = distanceToRouteM(routeCoords, driverCoords);
            if (distM < OFF_ROUTE_THRESHOLD_M) {
                return;
            }
            console.log(
                '[TripMapShell] Driver off-route',
                distM.toFixed(0),
                'm → refetch route'
            );
        }

        let cancelled = false;
        fetchDrivingRoute(driverCoords, targetCoords, DIRECTIONS_API_KEY).then(
            (points) => {
                if (cancelled) return;
                const next = points ?? [driverCoords, targetCoords];
                console.log(
                    '[TripMapShell] Route fetched:',
                    next.length,
                    'titik'
                );
                setRouteCoords(next);
            }
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        driverCoords.latitude,
        driverCoords.longitude,
        targetCoords.latitude,
        targetCoords.longitude,
    ]);

    // ============================================================
    // Simulasi driver (opsional)
    // ============================================================
    const simulated = useSimulatedDriver(
        routeCoords,
        SIMULATE_DRIVER && isRealRoute,
        800
    );
    const simCoords = simulated.coords;
    const simNext = simulated.nextPoint;

    const displayDriverCoords: Coords =
        SIMULATE_DRIVER && isRealRoute && simCoords ? simCoords : driverCoords;

    // ============================================================
    // Heading dari GPS asli
    // ============================================================
    const prevGpsRef = useRef<Coords | null>(null);
    const [gpsHeading, setGpsHeading] = useState(0);

    useEffect(() => {
        if (SIMULATE_DRIVER) return;
        if (!driverCoords) return;

        const prev = prevGpsRef.current;
        if (prev && hasMoved(prev, driverCoords)) {
            const nextHeading = bearingBetween(prev, driverCoords);
            setGpsHeading(nextHeading);
            console.log(
                '[TripMapShell] gpsHeading update:',
                nextHeading.toFixed(1)
            );
        }
        prevGpsRef.current = driverCoords;
    }, [driverCoords.latitude, driverCoords.longitude]);

    const heading = SIMULATE_DRIVER
        ? isRealRoute && simCoords && simNext
            ? bearingBetween(simCoords, simNext)
            : 0
        : gpsHeading;

    // ============================================================
    // Split route
    // ============================================================
    const passedIndex = useMemo(() => {
        if (!isRealRoute) return 0;
        if (typeof passedIndexProp === 'number') {
            return Math.max(
                0,
                Math.min(passedIndexProp, routeCoords.length - 1)
            );
        }
        return findNearestIndex(routeCoords, displayDriverCoords);
    }, [routeCoords, displayDriverCoords, passedIndexProp, isRealRoute]);

    useEffect(() => {
        console.log(
            '[TripMapShell] passedIndex:',
            passedIndex,
            '/',
            routeCoords.length - 1
        );
    }, [passedIndex, routeCoords.length]);

    const { passedCoords, remainingCoords } = useMemo(() => {
        if (!isRealRoute) {
            return { passedCoords: [], remainingCoords: routeCoords };
        }
        const idx = passedIndex;
        const passed = routeCoords.slice(0, idx + 1);
        const remaining = routeCoords.slice(idx);
        return {
            passedCoords: passed.length >= 2 ? passed : [],
            remainingCoords: remaining.length >= 2 ? remaining : [],
        };
    }, [routeCoords, passedIndex, isRealRoute]);

    const activeRouteColor = routeColor ?? targetColor;

    // ============================================================
    // Pulse tracking
    // ============================================================
    const [pulseTrack, setPulseTrack] = useState(true);
    useEffect(() => {
        setPulseTrack(true);
        const t = setTimeout(() => setPulseTrack(false), 100);
        return () => clearTimeout(t);
    }, [displayDriverCoords.latitude, displayDriverCoords.longitude]);

    // ============================================================
    // Fit bounds
    // ============================================================
    const fit = () => {
        const boundsSource =
            routeCoords.length > 1
                ? routeCoords
                : [displayDriverCoords, targetCoords];
        mapRef.current?.fitToCoordinates(boundsSource, {
            edgePadding: {
                top: insets.top + (showEmergency ? 70 : 30),
                bottom: measuredSheetHeight + 40,
                left: 50,
                right: 50,
            },
            animated: true,
        });
    };
    useEffect(() => {
        const t = setTimeout(fit, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeCoords, measuredSheetHeight]);

    const recenter = () => {
        mapRef.current?.animateCamera(
            { center: displayDriverCoords },
            { duration: 300 }
        );
    };

    const driverIcon = VEHICLE_ICONS[vehicleType] ?? MOTOR_IMG;

    // 🆕 Handler buka Google Maps
    const handleNavigate = () => {
        openNavigationTo(targetCoords);
    };

    return (
        <View style={{ flex: 1 }}>
            <MapView
                ref={mapRef}
                style={StyleSheet.absoluteFill}
                provider={MAP_PROVIDER}
                customMapStyle={mapStyle}
                toolbarEnabled={false}
                rotateEnabled={false}
                onMapReady={fit}
                initialRegion={{
                    ...driverCoords,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                }}
            >
                {/* RUTE SUDAH DILEWATI (abu-abu) */}
                {passedCoords.length >= 2 && (
                    <>
                        <Polyline
                            coordinates={passedCoords}
                            strokeColor={PASSED_BORDER}
                            strokeWidth={10}
                            lineCap="round"
                            lineJoin="round"
                            zIndex={1}
                        />
                        <Polyline
                            coordinates={passedCoords}
                            strokeColor={passedColor}
                            strokeWidth={6}
                            lineCap="round"
                            lineJoin="round"
                            zIndex={2}
                        />
                    </>
                )}

                {/* RUTE BELUM DILEWATI (berwarna) */}
                {remainingCoords.length >= 2 && (
                    <>
                        <Polyline
                            coordinates={remainingCoords}
                            strokeColor="#ffffff"
                            strokeWidth={10}
                            lineCap="round"
                            lineJoin="round"
                            zIndex={3}
                        />
                        <Polyline
                            coordinates={remainingCoords}
                            strokeColor={activeRouteColor}
                            strokeWidth={6}
                            lineCap="round"
                            lineJoin="round"
                            zIndex={4}
                        />
                    </>
                )}

                {/* MARKER TARGET */}
                <Marker
                    coordinate={targetCoords}
                    anchor={{
                        x: 0.5,
                        y: targetMarkerType === 'pin' ? 1 : 0.5,
                    }}
                    zIndex={5}
                >
                    {targetMarkerType === 'account' ? (
                        <View
                            style={[
                                m.accountPin,
                                { backgroundColor: targetColor },
                            ]}
                        >
                            <Ionicons name="person" size={14} color="#fff" />
                        </View>
                    ) : (
                        <View
                            style={[
                                m.targetPin,
                                { backgroundColor: targetColor },
                            ]}
                        >
                            <Ionicons
                                name="location"
                                size={16}
                                color="#fff"
                            />
                        </View>
                    )}
                </Marker>

                {/* MARKER DRIVER */}
                <Marker
                    coordinate={displayDriverCoords}
                    anchor={{ x: 0.5, y: 0.5 }}
                    rotation={heading}
                    flat
                    tracksViewChanges={!motorReady || pulseTrack}
                    zIndex={6}
                >
                    <Image
                        source={driverIcon}
                        style={{ width: 40, height: 40 }}
                        resizeMode="contain"
                        onLoadEnd={() => setMotorReady(true)}
                    />
                </Marker>
            </MapView>

            {showEmergency && (
                <View style={[m.emergencyWrap, { top: insets.top + 16 }]}>
                    <Pressable
                        style={m.emergencyPill}
                        onPress={onEmergency}
                        disabled={!onEmergency}
                        hitSlop={8}
                    >
                        <View style={m.emergencyIconCircle}>
                            <Ionicons name="call" size={12} color="#fff" />
                        </View>
                        <Text style={m.emergencyText}>{emergencyLabel}</Text>
                    </Pressable>
                </View>
            )}

            <View
                style={[m.fabColumn, { bottom: measuredSheetHeight + 16 }]}
            >

                <Pressable style={m.fabWhite} onPress={recenter}>
                    <Ionicons
                        name="locate"
                        size={20}
                        color={colors.primary}
                    />
                </Pressable>

                {/* 🆕 FAB Navigate → Google Maps */}
                <Pressable style={m.fabBlue} onPress={handleNavigate}>
                    <Ionicons name="navigate" size={20} color="#fff" />
                </Pressable>
            </View>

            <View
                style={[
                    m.sheet,
                    {
                        paddingBottom: insets.bottom + 12,
                        minHeight: sheetHeight,
                        maxHeight: '85%',
                    },
                ]}
                onLayout={(e) =>
                    setMeasuredSheetHeight(e.nativeEvent.layout.height)
                }
            >
                <View style={m.handleArea}>
                    <View style={m.handle} />
                </View>
                {children}
            </View>
        </View>
    );
}

const m = StyleSheet.create({
    targetPin: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    accountPin: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#fff',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    emergencyWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    emergencyPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#fff',
        borderRadius: 24,
        paddingLeft: 6,
        paddingRight: 16,
        paddingVertical: 6,
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    emergencyIconCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emergencyText: {
        color: colors.danger,
        fontWeight: '800',
        fontSize: 13,
        letterSpacing: 0.3,
    },
    fabColumn: {
        position: 'absolute',
        right: 16,
        gap: 12,
        alignItems: 'center',
    },
    fabWhite: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    fabBlue: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        paddingHorizontal: 16,
        elevation: 12,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 10,
    },
    handleArea: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 6,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c9ccd1',
    },
});