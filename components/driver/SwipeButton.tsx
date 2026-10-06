import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

type Props = {
    label: string;
    onConfirm: () => void;
    color?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    disabled?: boolean;
    height?: number;
};

const THUMB = 48;
const PAD = 4;

export default function SwipeButton({
    label,
    onConfirm,
    color = '#1877F2',
    icon = 'arrow-forward',
    disabled,
    height = 56,
}: Props) {
    const [trackW, setTrackW] = useState(0);
    const x = useSharedValue(0);
    const [confirmed, setConfirmed] = useState(false);

    const maxX = Math.max(0, trackW - THUMB - PAD * 2);
    const thumbTop = (height - THUMB) / 2;

    const fire = () => {
        setConfirmed(true);
        onConfirm();
    };

    const pan = Gesture.Pan()
        .enabled(!disabled && !confirmed)
        .onUpdate((e) => {
            x.value = Math.min(Math.max(0, e.translationX), maxX);
        })
        .onEnd(() => {
            if (x.value > maxX * 0.82) {
                x.value = withSpring(maxX, { damping: 20 });
                runOnJS(fire)();
            } else {
                x.value = withSpring(0, { damping: 20 });
            }
        });

    const thumbStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }],
        top: thumbTop,
    }));

    // efek redup halus saat ditarik -> feedback visual tanpa perlu mixing warna
    const trackStyle = useAnimatedStyle(() => ({
        opacity: disabled ? 0.5 : maxX > 0 ? 1 - 0.15 * (x.value / maxX) : 1,
        backgroundColor: color,
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: maxX > 0 ? 1 - x.value / maxX : 1,
    }));

    return (
        <Animated.View
            style={[s.track, trackStyle, { height }]}
            onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        >
            <Animated.Text style={[s.label, labelStyle]} numberOfLines={1}>
                {label}
            </Animated.Text>
            <GestureDetector gesture={pan}>
                <Animated.View
                    style={[
                        s.thumb,
                        { width: THUMB, height: THUMB },
                        thumbStyle,
                    ]}
                >
                    <Ionicons name={confirmed ? 'checkmark' : icon} size={22} color={color} />
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    track: {
        borderRadius: 16, // rounded-square, bukan pill (28 = terlalu bulat)
        justifyContent: 'center',
        paddingLeft: THUMB + PAD * 2 + 10,
        paddingRight: 16,
        overflow: 'hidden',
    },
    label: {
        position: 'absolute',
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#fff',
        fontWeight: '800',
        fontSize: 15,
    },
    thumb: {
        position: 'absolute',
        left: PAD,
        borderRadius: 12, // rounded-square kecil, senada dengan track
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
});