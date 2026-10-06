import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

type Props = {
    color: string;
    icon: keyof typeof Ionicons.glyphMap;
    /** diameter titik solid di tengah */
    size?: number;
};

/** satu ring yang membesar & memudar, dipakai berulang dengan delay berbeda */
function Ring({ color, delay, maxScale }: { color: string; delay: number; maxScale: number }) {
    const p = useSharedValue(0);

    useEffect(() => {
        p.value = withDelay(
            delay,
            withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false)
        );
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + p.value * (maxScale - 1) }],
        opacity: (1 - p.value) * 0.45,
    }));

    return <Animated.View style={[StyleSheet.absoluteFill, s.ring, { backgroundColor: color }, style]} />;
}

/**
 * Titik penanda posisi (lokasi pengguna / driver) dengan efek radar berdenyut di belakangnya.
 * Dipakai sebagai children <Marker> di react-native-maps.
 */
export function PulsingDot({ color, icon, size = 20 }: Props) {
    const wrapSize = size * 3;

    return (
        <View style={[s.wrap, { width: wrapSize, height: wrapSize }]}>
            <Ring color={color} delay={0} maxScale={2.6} />
            <Ring color={color} delay={600} maxScale={2.6} />
            <View style={[s.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
                <Ionicons name={icon} size={size * 0.6} color="#fff" />
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center' },
    ring: { borderRadius: 999 },
    dot: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
        elevation: 4,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
});