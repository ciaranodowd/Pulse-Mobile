// PulseRings.js
// Skia-powered pulse ring animation for React Native (Expo SDK 54)
// Pure React state + setInterval — zero reanimated dependency

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import {
  Canvas,
  Circle,
  Group,
  Paint,
  BlurMask,
} from "@shopify/react-native-skia";

// ─── Config ───────────────────────────────────────────────────────────────────
const RING_COUNT     = 6;
const RING_SPACING   = 22;
const BURST_INTERVAL = 1200;
const RING_SPEED     = 1.4;
const COLOR_THEMES   = [
  { r: 0,   g: 207, b: 255 },
  { r: 168, g: 85,  b: 247 },
  { r: 0,   g: 229, b: 200 },
];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const PulseRings = React.forwardRef(function PulseRings(
  { visible = false, duration = 5000, centerX, centerY },
  ref
) {
  const cx = centerX ?? SCREEN_W / 2;
  const cy = centerY ?? SCREEN_H / 2;

  const [active, setActive] = useState(false);
  const [bursts, setBursts] = useState([]);
  const [, setTick]         = useState(0);

  const frameRef  = useRef(null);
  const burstRef  = useRef(null);
  const stopRef   = useRef(null);
  const themeRef  = useRef(0);
  const burstsRef = useRef([]);

  const toHex = (n) =>
    Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

  const makeBurst = () => {
    const color = COLOR_THEMES[themeRef.current % COLOR_THEMES.length];
    themeRef.current++;
    const maxR = Math.min(SCREEN_W, SCREEN_H) * 0.5;
    return Array.from({ length: RING_COUNT }, (_, i) => ({
      r: Math.max(0, -i * RING_SPACING),
      maxR,
      color,
      alive: true,
    }));
  };

  const stopAnimation = useCallback(() => {
    clearInterval(frameRef.current);
    clearInterval(burstRef.current);
    clearTimeout(stopRef.current);
    frameRef.current = burstRef.current = stopRef.current = null;
    burstsRef.current = [];
    setBursts([]);
    setActive(false);
  }, []);

  const startAnimation = useCallback(() => {
    clearInterval(frameRef.current);
    clearInterval(burstRef.current);
    clearTimeout(stopRef.current);
    burstsRef.current = [];

    setActive(true);

    burstsRef.current = [makeBurst()];
    setBursts([...burstsRef.current]);

    burstRef.current = setInterval(() => {
      burstsRef.current = [...burstsRef.current, makeBurst()];
    }, BURST_INTERVAL);

    frameRef.current = setInterval(() => {
      const maxR = Math.min(SCREEN_W, SCREEN_H) * 0.5;

      burstsRef.current = burstsRef.current
        .map((burst) =>
          burst.map((ring) => {
            if (!ring.alive) return ring;
            const newR = ring.r + RING_SPEED;
            return { ...ring, r: newR, alive: newR < maxR + RING_SPACING };
          })
        )
        .filter((burst) => burst.some((r) => r.alive));

      setBursts([...burstsRef.current]);
      setTick((t) => t + 1);
    }, 16);

    stopRef.current = setTimeout(stopAnimation, duration);
  }, [duration, stopAnimation]);

  React.useImperativeHandle(ref, () => ({ trigger: startAnimation }));

  useEffect(() => {
    if (visible) startAnimation();
    else stopAnimation();
    return () => {
      clearInterval(frameRef.current);
      clearInterval(burstRef.current);
      clearTimeout(stopRef.current);
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {bursts.map((burst, bi) =>
          burst.map((ring, ri) => {
            if (!ring.alive || ring.r <= 0) return null;

            const { r: radius, color, maxR } = ring;
            const progress = radius / maxR;

            let alpha;
            if (progress < 0.06)      alpha = progress / 0.06;
            else if (progress > 0.55) alpha = 1 - (progress - 0.55) / 0.45;
            else                      alpha = 1.0;

            const packFade = 1 - (ri / RING_COUNT) * 0.35;
            const fa       = Math.max(0, Math.min(1, alpha * packFade));
            if (fa < 0.01) return null;

            const { r: cr, g: cg, b: cb } = color;
            const ringColor = `#${toHex(cr)}${toHex(cg)}${toHex(cb)}${toHex(fa * 255)}`;
            const midColor  = `#${toHex(cr)}${toHex(cg)}${toHex(cb)}${toHex(fa * 120)}`;
            const glowColor = `#${toHex(cr)}${toHex(cg)}${toHex(cb)}${toHex(fa * 55)}`;

            return (
              <Group key={`${bi}-${ri}`}>
                <Circle cx={cx} cy={cy} r={radius}>
                  <Paint style="stroke" strokeWidth={28} color={glowColor}>
                    <BlurMask blur={14} style="normal" />
                  </Paint>
                </Circle>
                <Circle cx={cx} cy={cy} r={radius}>
                  <Paint style="stroke" strokeWidth={9} color={midColor}>
                    <BlurMask blur={4} style="normal" />
                  </Paint>
                </Circle>
                <Circle cx={cx} cy={cy} r={radius}>
                  <Paint style="stroke" strokeWidth={2} color={ringColor} />
                </Circle>
              </Group>
            );
          })
        )}

        <Circle cx={cx} cy={cy} r={8}>
          <Paint color="#ffffff">
            <BlurMask blur={6} style="normal" />
          </Paint>
        </Circle>
        <Circle cx={cx} cy={cy} r={4}>
          <Paint color="#ffffff" />
        </Circle>
      </Canvas>
    </View>
  );
});

export default PulseRings;