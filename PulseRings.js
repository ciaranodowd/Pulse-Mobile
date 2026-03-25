// PulseRings.js — RN Animated ripple rings (no Skia)
// Fixed 140×140 wrapper absolutely positioned at user screen coords.
// 3 border-only rings: transparent fill, thin border, animated scale+opacity.
// No fullscreen overlay. No solid backgrounds. No Skia Canvas.

import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const WRAPPER_SIZE = 140;
const RING_SIZE    = 120;   // fits inside wrapper with room to spare
const DOT_SIZE     = 16;

const RING_CONFIGS = [
  { delay: 0,   borderColor: "#ee44ff", borderWidth: 4,   peakOpacity: 0.80, fillColor: "rgba(238, 68, 255, 0.09)" },  // bright fuchsia — slightly more vivid
  { delay: 280, borderColor: "#b44ff7", borderWidth: 2.5, peakOpacity: 0.52, fillColor: "rgba(180, 79, 247, 0.05)" },  // medium violet — tighter stagger
  { delay: 560, borderColor: "#7c3aed", borderWidth: 1.5, peakOpacity: 0.28, fillColor: "rgba(124, 58, 237, 0.02)" },  // deep purple — thinner outer
];

const DURATION = 1500;  // ms per ring — slightly snappier than 1600

// ─── Component ────────────────────────────────────────────────────────────────
const PulseRings = React.forwardRef(function PulseRings(
  { visible = false, centerX, centerY },
  ref
) {
  // One scale + opacity Animated.Value per ring
  const anims = useRef(
    RING_CONFIGS.map(() => ({
      scale:   new Animated.Value(0.15),
      opacity: new Animated.Value(0),
    }))
  ).current;

  const compositeRef = useRef(null);

  const stopAnimation = useCallback(() => {
    if (compositeRef.current) {
      compositeRef.current.stop();
      compositeRef.current = null;
    }
    anims.forEach(({ scale, opacity }) => {
      scale.setValue(0.15);
      opacity.setValue(0);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAnimation = useCallback(() => {
    stopAnimation();

    const sequences = RING_CONFIGS.map(({ delay, peakOpacity }, i) => {
      const { scale, opacity } = anims[i];
      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          // scale: 0.15 → 1.0 — cubic out feels more organic than quad
          Animated.timing(scale, {
            toValue:        1.0,
            duration:       DURATION,
            easing:         Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          // opacity: 0 → peakOpacity (fast), then peakOpacity → 0 (slow fade)
          Animated.sequence([
            Animated.timing(opacity, {
              toValue:        peakOpacity,
              duration:       DURATION * 0.15,
              easing:         Easing.linear,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue:        0,
              duration:       DURATION * 0.85,
              easing:         Easing.out(Easing.cubic),  // smoother tail fade
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
    });

    compositeRef.current = Animated.parallel(sequences);
    compositeRef.current.start(() => {
      compositeRef.current = null;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose trigger() for imperative use from App.js
  React.useImperativeHandle(ref, () => ({ trigger: startAnimation }));

  useEffect(() => {
    if (visible) startAnimation();
    else stopAnimation();
    return stopAnimation;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || centerX == null || centerY == null) return null;

  return (
    // Fixed-size wrapper centred on user's screen position — NOT fullscreen
    <View
      pointerEvents="none"
      style={[
        styles.wrapper,
        {
          left: centerX - WRAPPER_SIZE / 2,
          top:  centerY - WRAPPER_SIZE / 2,
        },
      ]}
    >
      {/* 3 soft purple rings — thin fill + border for atmospheric glow */}
      {RING_CONFIGS.map(({ borderColor, borderWidth, fillColor }, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              borderColor,
              borderWidth,
              backgroundColor: fillColor,
              opacity:   anims[i].opacity,
              transform: [{ scale: anims[i].scale }],
            },
          ]}
        />
      ))}

      {/* Static center dot — never animated, never scales */}
      <View style={styles.dot} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position:        "absolute",
    width:           WRAPPER_SIZE,
    height:          WRAPPER_SIZE,
    justifyContent:  "center",
    alignItems:      "center",
  },
  ring: {
    position:        "absolute",
    width:           RING_SIZE,
    height:          RING_SIZE,
    borderRadius:    RING_SIZE / 2,
    // borderWidth and backgroundColor set per-ring via RING_CONFIGS
  },
  dot: {
    width:           DOT_SIZE,
    height:          DOT_SIZE,
    borderRadius:    DOT_SIZE / 2,
    backgroundColor: "#e040fb",
    shadowColor:     "#e040fb",
    shadowOpacity:   0.85,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 0 },
    elevation:       6,
  },
});

export default PulseRings;
