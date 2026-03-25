// PulseLoadingScreen.js
// Branded splash: dark purple-black bg, italic white PULSE, double-pulse heartbeat
// with a soft oval glow bloom on each beat. Zero extra deps — only RN Animated.

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Dimensions,
} from "react-native";

const { width: W, height: H } = Dimensions.get("window");
const MIN_DISPLAY_MS = 1200;

// Base glow opacity levels
const GLOW_REST  = 0.10;
const GLOW_BEAT1 = 0.30; // stronger first beat
const GLOW_BEAT2 = 0.20; // softer second beat

export default function PulseLoadingScreen({ loading, onFadeComplete }) {
  const screenFade  = useRef(new Animated.Value(1)).current;
  const heartScale  = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0.86)).current;
  const glowScale   = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(GLOW_REST)).current;
  const minElapsed  = useRef(false);
  const readyToFade = useRef(false);

  // ── Heartbeat loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Helper: drive all animated values in parallel for one phase of a beat
    const phase = (textTo, glowScaleTo, glowOpTo, textOpTo, dur, easing) =>
      Animated.parallel([
        Animated.timing(heartScale,  { toValue: textTo,      duration: dur, easing, useNativeDriver: true }),
        Animated.timing(glowScale,   { toValue: glowScaleTo, duration: dur, easing, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: glowOpTo,    duration: dur, easing, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: textOpTo,    duration: dur, easing, useNativeDriver: true }),
      ]);

    const easeOut = Easing.out(Easing.quad);
    const easeIn  = Easing.in(Easing.quad);

    const beat = Animated.sequence([
      // ── Beat 1 (stronger) ──────────────────────────────────────────
      // expand: text 1→1.08, glow 1→1.40, opacity peaks
      phase(1.08, 1.40, GLOW_BEAT1, 1.00, 110, easeOut),
      // contract: all return to rest
      phase(1.00, 1.00, GLOW_REST,  0.86, 110, easeIn),

      // short inter-beat gap
      Animated.delay(40),

      // ── Beat 2 (softer) ────────────────────────────────────────────
      // expand: text 1→1.04, glow 1→1.22, slightly weaker bloom
      phase(1.04, 1.22, GLOW_BEAT2, 0.96, 130, easeOut),
      // contract
      phase(1.00, 1.00, GLOW_REST,  0.86, 130, easeIn),

      // ── Rest pause ────────────────────────────────────────────────
      Animated.delay(650),
    ]);

    const loop = Animated.loop(beat);
    loop.start();
    return () => loop.stop();
  }, []);

  // ── Minimum display + fade-out ─────────────────────────────────────────────
  const startFade = () => {
    Animated.timing(screenFade, {
      toValue:  0,
      duration: 500,
      easing:   Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => onFadeComplete && onFadeComplete());
  };

  useEffect(() => {
    const t = setTimeout(() => {
      minElapsed.current = true;
      if (readyToFade.current) startFade();
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loading) {
      if (minElapsed.current) startFade();
      else readyToFade.current = true;
    }
  }, [loading]);

  // Inner glow opacity = glowOpacity * 1.8 (brighter core)
  const innerGlowOpacity = Animated.multiply(glowOpacity, 1.8);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.container, { opacity: screenFade }]}>

      {/* Glow bloom — outer halo (widest, dimmest) */}
      <Animated.View
        style={[
          styles.glowOuter,
          {
            opacity:   glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* Glow bloom — inner core (narrower, brighter) */}
      <Animated.View
        style={[
          styles.glowInner,
          {
            opacity:   innerGlowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* PULSE wordmark */}
      <Animated.Text
        style={[
          styles.wordmark,
          {
            opacity:   textOpacity,
            transform: [
              { scale: heartScale },
              { skewX: "-6deg" },
            ],
          },
        ]}
      >
        PULSE
      </Animated.Text>

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position:        "absolute",
    top: 0, left: 0,
    width:           W,
    height:          H,
    backgroundColor: "#080010",
    justifyContent:  "center",
    alignItems:      "center",
  },

  // Wide soft halo — gives depth to the bloom
  glowOuter: {
    position:        "absolute",
    width:           420,
    height:          130,
    borderRadius:    65,
    backgroundColor: "#9b6dff",
  },

  // Tighter bright core of the glow
  glowInner: {
    position:        "absolute",
    width:           260,
    height:          78,
    borderRadius:    39,
    backgroundColor: "#c4a0ff",
  },

  wordmark: {
    fontSize:      72,
    fontWeight:    "800",
    color:         "#ffffff",
    letterSpacing: 14,
    // nudge right to visually re-centre after letter-spacing offset
    marginLeft:    14,
  },
});
