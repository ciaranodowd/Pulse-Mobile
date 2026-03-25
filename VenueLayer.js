// VenueLayer.js — Nightlife energy tower visualization
//
// 3-layer system: Glow base + Neon prism tower + Venue orbs
//
//   LAYER 1 — Glow base (GPU — Mapbox CircleLayer)
//     Two CircleLayer instances per venue point (outer halo + inner core).
//     circlePitchAlignment:"map" keeps the glow lying flat on the ground
//     surface so it reads as emitted light cast downward.
//
//   LAYER 2 — Neon prism tower (GPU — Mapbox FillExtrusionLayer × 2)
//
//     LAYER 2a — Outer glow shell
//       Diamond polygon, 8m half-size, bright neon type color, low opacity.
//       Rendered behind the body — only the 3m overhang beyond the body
//       perimeter is visible, creating neon edge / perimeter glow.
//       Selected: opacity bumped for "beacon activating" feel.
//
//     LAYER 2b — Dark core body
//       Diamond polygon, 5m half-size, near-black color lightly tinted
//       with the type hue. High opacity — the dark interior framed by the
//       neon shell edges. Selected: slightly brighter dark + cyan tint.
//
//     Diamond footprint (rotated square — N/E/S/W apices) reads as a
//     faceted crystal shard / prism rather than a plain block.
//     Compact footprint (5m body) + tall height (20–100m) = strong
//     vertical silhouette — reads as a beacon, not a flat tile.
//
//   LAYER 3 — Venue orbs (React Native — Mapbox.MarkerView)
//     Animated glowing orb hovering above each venue tower.
//     Uses a 3D coordinate [lon, lat, towerHeight + hover] so the orb
//     is anchored to the actual 3D top of the extrusion in world space —
//     no screen-space pixel offset that drifts with camera pitch/heading.
//     anchor y:1.0 pins the orb's bottom to that 3D projected position.
//
// Props: venues, leaderboard, selectedVenueId, reactingVenueIds, debugMode, onPress

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, View }             from "react-native";
import Mapbox                                  from "@rnmapbox/maps";

// ─────────────────────────────────────────────────────────────────────────────
// Venue type classification
//   nightclub — nightclubs, clubs
//   bar       — bars, cocktail bars, lounges, speakeasies
//   pub       — pubs, gastropubs, taverns, breweries
//   fallback  — anything unrecognised
// ─────────────────────────────────────────────────────────────────────────────
function venueType(kind) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("nightclub") || k === "club")                                   return "nightclub";
  if (k.includes("cocktail") || k.includes("lounge") || k.includes("speakeasy")) return "bar";
  if (k.includes("pub") || k.includes("gastropub") || k.includes("tavern") || k.includes("brewery")) return "pub";
  if (k.includes("bar") || k.includes("club"))                                   return "bar";
  return "fallback";
}

// ─────────────────────────────────────────────────────────────────────────────
// Luminous nightlife color palette — distinct readable signals on dark-v11
//   pub       → warm amber / gold
//   bar       → hot pink / magenta
//   nightclub → electric blue-violet (shifted cooler than previous violet)
//   fallback  → soft neon purple
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  pub:       "#FFAB3F",
  bar:       "#FF4FA8",
  nightclub: "#5B65FF",
  fallback:  "#C084FC",
};

// Selected venue overrides to cyan (matches app-wide selection highlight)
const SELECTED_COLOR = "#00E5FF";

// Metres above the tower top the orb hovers (3D world-space, not screen pixels).
// The MarkerView uses a 3D coordinate [lon, lat, towerHeight + ORB_HOVER_M] so
// the orb tracks the actual extrusion top correctly at any camera pitch/heading.
const ORB_HOVER_M = 6;

// ─────────────────────────────────────────────────────────────────────────────
// hexToRgba — "#RRGGBB" + alpha → "rgba(r,g,b,a)"
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// darkBodyColor — near-black with a subtle hue tint of the neon color.
//   intensity 0.13 → very dark tinted core  (normal state)
//   intensity 0.28 → slightly brighter dark (selected / activated state)
//
//   Examples at intensity 0.13:
//     amber   #FFAB3F → #271c0e  (dark warm tint)
//     magenta #FF4FA8 → #270d1b  (dark pink tint)
//     violet  #5B65FF → #0d0f27  (dark blue tint)
//     cyan    #00E5FF → #062427  (dark teal tint)
// ─────────────────────────────────────────────────────────────────────────────
function darkBodyColor(hex, intensity = 0.13) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.min(255, Math.round(6 + r * intensity));
  const dg = Math.min(255, Math.round(6 + g * intensity));
  const db = Math.min(255, Math.round(6 + b * intensity));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// bpmToHeight — BPM → extrusion height (metres)
//
//   Power curve (exponent 1.75) creates dramatic contrast.
//   Floor raised to 20 m so every venue reads as a beacon, not a flat tile.
//   Body footprint is 5 m half-size (10 m across), giving a 20/10 = 2.0
//   aspect ratio even at minimum — strongly vertical silhouette.
//
//     bpm  0 →  20 m  (quiet stub — still a visible pillar)
//     bpm  1 →  23 m
//     bpm  3 →  38 m
//     bpm  5 →  62 m
//     bpm  8 → 100 m  (cap)
// ─────────────────────────────────────────────────────────────────────────────
export function bpmToHeight(bpm) {
  if (bpm <= 0) return 20;
  return Math.min(Math.round(20 + Math.pow(bpm, 1.75) * 2.8), 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// bpmToGlow — BPM → ground-plane circle glow geometry
// ─────────────────────────────────────────────────────────────────────────────
function bpmToGlow(bpm) {
  if (bpm >= 10) return { outer: 38, inner: 24, opacity: 0.42 };
  if (bpm >=  4) return { outer: 30, inner: 19, opacity: 0.32 };
  if (bpm >=  1) return { outer: 24, inner: 15, opacity: 0.22 };
  return               { outer: 18, inner: 11, opacity: 0.10 };
}

// ─────────────────────────────────────────────────────────────────────────────
// bpmToOrbProps — BPM → venue orb visual properties
//   coreSize:   diameter (px) of the bright centre dot
//   pulseScale: peak scale multiplier in the breathe animation
// ─────────────────────────────────────────────────────────────────────────────
function bpmToOrbProps(bpm) {
  if (bpm >= 10) return { coreSize: 18, pulseScale: 1.14 };
  if (bpm >=  4) return { coreSize: 14, pulseScale: 1.10 };
  if (bpm >=  1) return { coreSize: 11, pulseScale: 1.07 };
  return           { coreSize:  9, pulseScale: 1.04 };
}

// ─────────────────────────────────────────────────────────────────────────────
// venuePolygon — diamond-shaped GeoJSON Polygon for the extrusion tower.
//
//   Four vertices at cardinal points (N / E / S / W) form a rotated square.
//   Reads as a faceted crystal shard / prism rather than a plain block.
//   halfSizeMeters = distance from centre to each apex.
//
//   Called twice per venue:
//     halfSizeMeters = 8  → outer glow shell (3m overhang beyond body)
//     halfSizeMeters = 5  → inner dark body  (compact — forces tall aspect ratio)
// ─────────────────────────────────────────────────────────────────────────────
function venuePolygon(lat, lon, halfSizeMeters = 5) {
  const dLat = halfSizeMeters / 111_000;
  const dLon = halfSizeMeters / (111_000 * Math.cos((lat * Math.PI) / 180));
  const ring = [
    [lon,        lat - dLat],  // south apex
    [lon + dLon, lat        ],  // east apex
    [lon,        lat + dLat],  // north apex
    [lon - dLon, lat        ],  // west apex
    [lon,        lat - dLat],  // close ring
  ];
  return { type: "Polygon", coordinates: [ring] };
}

// ─────────────────────────────────────────────────────────────────────────────
// VenueOrb — glowing pulsing orb hovering above a venue tower.
//
// Mirrors UserOrb from App.js:
//   - Animated.loop breathe sequence (scale + opacity in parallel)
//   - Easing.inOut(Easing.sin) easing, 1200ms each direction
//   - 5-layer concentric circle structure
//   - useNativeDriver:true
// ─────────────────────────────────────────────────────────────────────────────
function VenueOrb({ color, coreSize, pulseScale }) {
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.9)).current;
  const loopRef     = useRef(null);

  useEffect(() => {
    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim,   { toValue: pulseScale, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.65,       duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim,   { toValue: 1.0,        duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.90,       duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [pulseScale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Concentric layer sizes — same ≈4.7/3.7/2.7/1.7/1 ratio as UserOrb
  const s = {
    outer: coreSize * 4.7,
    mid:   coreSize * 3.7,
    inner: coreSize * 2.7,
    halo:  coreSize * 1.7,
    core:  coreSize,
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width:           s.outer,
        height:          s.outer,
        alignItems:      "center",
        justifyContent:  "center",
        transform:       [{ scale: scaleAnim }],
        opacity:         opacityAnim,
      }}
    >
      <View style={{ position: "absolute", width: s.outer, height: s.outer, borderRadius: s.outer / 2, backgroundColor: hexToRgba(color, 0.08) }} />
      <View style={{ position: "absolute", width: s.mid,   height: s.mid,   borderRadius: s.mid   / 2, backgroundColor: hexToRgba(color, 0.15) }} />
      <View style={{ position: "absolute", width: s.inner, height: s.inner, borderRadius: s.inner / 2, backgroundColor: hexToRgba(color, 0.28) }} />
      <View style={{ position: "absolute", width: s.halo,  height: s.halo,  borderRadius: s.halo  / 2, backgroundColor: hexToRgba(color, 0.52) }} />
      <View style={{
        width:           s.core,
        height:          s.core,
        borderRadius:    s.core / 2,
        backgroundColor: "#F4F4F6",
        shadowColor:     color,
        shadowOpacity:   1,
        shadowRadius:    s.core * 0.7,
        shadowOffset:    { width: 0, height: 0 },
        elevation:       10,
      }} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VenueLayer
// ─────────────────────────────────────────────────────────────────────────────
export default function VenueLayer({
  venues,
  leaderboard,
  selectedVenueId,
  reactingVenueIds,  // API compat — reserved for future pulse-reaction support
  debugMode,         // API compat — reserved
  onPress,
}) {
  // Fast venueId → bpm lookup rebuilt only when leaderboard changes
  const bpmMap = useMemo(
    () => new Map((leaderboard || []).map((r) => [r.venueId, r.bpm])),
    [leaderboard],
  );

  const validVenues = useMemo(
    () => (venues || []).filter(
      (v) => Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude))
    ),
    [venues],
  );

  // ── Point FeatureCollection — LAYER 1 (circle glow base)
  const pointsGeoJSON = useMemo(() => {
    const features = validVenues.map((v) => {
      const bpm        = bpmMap.get(v.id) ?? 0;
      const type       = venueType(v.kind);
      const isSelected = v.id === selectedVenueId;
      const glow       = bpmToGlow(bpm);

      return {
        type: "Feature",
        id: String(v.id),
        properties: {
          venueId:     String(v.id),
          color:       isSelected ? SELECTED_COLOR : TYPE_COLOR[type],
          outerRadius: glow.outer,
          innerRadius: glow.inner,
          glowOpacity: isSelected ? Math.min(glow.opacity + 0.18, 0.62) : glow.opacity,
        },
        geometry: {
          type: "Point",
          coordinates: [Number(v.longitude), Number(v.latitude)],
        },
      };
    });
    return { type: "FeatureCollection", features };
  }, [validVenues, bpmMap, selectedVenueId]);

  // ── Polygon FeatureCollection — LAYER 2a (outer glow shell)
  //    Diamond (8m half-size). Rendered first (behind body) so only
  //    the 3m perimeter overhang is visible as neon edge glow.
  //    shellOpacity: selected towers glow more intensely (activated beacon).
  const glowShellGeoJSON = useMemo(() => {
    const features = validVenues.map((v) => {
      const lat        = Number(v.latitude);
      const lon        = Number(v.longitude);
      const bpm        = bpmMap.get(v.id) ?? 0;
      const type       = venueType(v.kind);
      const isSelected = v.id === selectedVenueId;

      const baseHeight  = bpmToHeight(bpm);
      const height      = isSelected ? Math.round(baseHeight * 1.25) : baseHeight;
      const neonColor   = isSelected ? SELECTED_COLOR : TYPE_COLOR[type];
      const shellOpacity = isSelected ? 0.48 : 0.32;

      return {
        type: "Feature",
        id: `shell-${v.id}`,
        properties: {
          venueId:      String(v.id),
          color:        neonColor,
          height,
          shellOpacity,
        },
        geometry: venuePolygon(lat, lon, 8),
      };
    });
    return { type: "FeatureCollection", features };
  }, [validVenues, bpmMap, selectedVenueId]);

  // ── Polygon FeatureCollection — LAYER 2b (dark core body)
  //    Compact diamond (5m half-size). Near-black color lightly tinted with
  //    the venue type hue — dark energy core framed by the neon shell edges.
  //    Selected: brighter dark tint (intensity 0.28 vs 0.13) + slightly
  //    higher opacity so the "powered up" state reads on the body itself.
  const bodyGeoJSON = useMemo(() => {
    const features = validVenues.map((v) => {
      const lat        = Number(v.latitude);
      const lon        = Number(v.longitude);
      const bpm        = bpmMap.get(v.id) ?? 0;
      const type       = venueType(v.kind);
      const isSelected = v.id === selectedVenueId;

      const baseHeight = bpmToHeight(bpm);
      const height     = isSelected ? Math.round(baseHeight * 1.25) : baseHeight;
      const neonColor  = isSelected ? SELECTED_COLOR : TYPE_COLOR[type];
      const bodyColor  = darkBodyColor(neonColor, isSelected ? 0.28 : 0.13);
      const bodyOpacity = isSelected ? 0.92 : 0.86;

      return {
        type: "Feature",
        id: `body-${v.id}`,
        properties: {
          venueId:     String(v.id),
          bodyColor,
          height,
          bodyOpacity,
        },
        geometry: venuePolygon(lat, lon, 5),
      };
    });
    return { type: "FeatureCollection", features };
  }, [validVenues, bpmMap, selectedVenueId]);

  // Map tapped polygon feature back to the original venue object
  const handlePress = (e) => {
    const feature = e?.features?.[0];
    if (!feature) return;
    const venueId = feature.properties?.venueId;
    const venue   = validVenues.find((v) => String(v.id) === venueId);
    if (venue && onPress) onPress(venue);
  };

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════
          LAYER 1 — Glow base
          Flat ground-plane circles — light emitted downward from each tower.
         ══════════════════════════════════════════════════════════════════ */}
      <Mapbox.ShapeSource id="vl-glow-src" shape={pointsGeoJSON}>

        {/* Outer halo — wide, maximum blur, low opacity */}
        <Mapbox.CircleLayer
          id="vl-glow-outer"
          style={{
            circleRadius:         ["get", "outerRadius"],
            circleColor:          ["get", "color"],
            circleOpacity:        ["get", "glowOpacity"],
            circleBlur:           1.0,
            circlePitchAlignment: "map",
          }}
        />

        {/* Inner core — tighter, less blur, 1.5× more opaque for hot centre */}
        <Mapbox.CircleLayer
          id="vl-glow-inner"
          style={{
            circleRadius:         ["get", "innerRadius"],
            circleColor:          ["get", "color"],
            circleOpacity:        ["min", ["*", ["get", "glowOpacity"], 1.5], 1.0],
            circleBlur:           0.6,
            circlePitchAlignment: "map",
          }}
        />

      </Mapbox.ShapeSource>

      {/* ══════════════════════════════════════════════════════════════════
          LAYER 2a — Outer glow shell
          Diamond (8m half-size), bright neon type color.
          Rendered before the body so only the 3m perimeter overhang is
          visible, reading as glowing neon edges around the dark core.
          fillExtrusionOpacity is static (iOS does not support data expressions here).
          Selection is expressed through color (→ cyan) and height (×1.25).
         ══════════════════════════════════════════════════════════════════ */}
      <Mapbox.ShapeSource id="vl-shell-src" shape={glowShellGeoJSON}>
        <Mapbox.FillExtrusionLayer
          id="vl-shell"
          style={{
            fillExtrusionColor:   ["get", "color"],
            fillExtrusionHeight:  ["get", "height"],
            fillExtrusionBase:    0,
            fillExtrusionOpacity: 0.35,   // static — data expressions not supported on iOS for this property
          }}
        />
      </Mapbox.ShapeSource>

      {/* ══════════════════════════════════════════════════════════════════
          LAYER 2b — Dark core body
          Compact diamond (5m half-size), near-black color tinted with venue hue.
          Rendered after the shell — sits in front, leaving neon edges
          visible around the perimeter.
          fillExtrusionOpacity is static (iOS does not support data expressions here).
          Selection expressed through bodyColor (brighter dark tint) and height (×1.25).
          onPress here is the primary tap target.
         ══════════════════════════════════════════════════════════════════ */}
      <Mapbox.ShapeSource
        id="vl-body-src"
        shape={bodyGeoJSON}
        onPress={handlePress}
      >
        <Mapbox.FillExtrusionLayer
          id="vl-body"
          style={{
            fillExtrusionColor:   ["get", "bodyColor"],
            fillExtrusionHeight:  ["get", "height"],
            fillExtrusionBase:    0,
            fillExtrusionOpacity: 0.88,   // static — data expressions not supported on iOS for this property
          }}
        />
      </Mapbox.ShapeSource>

      {/* ══════════════════════════════════════════════════════════════════
          LAYER 3 — Venue orbs (Mapbox.MarkerView + React Native Animated)
          Glowing pulsing orb anchored just above each tower top.

          Coordinate is 3D: [lon, lat, towerHeight + ORB_HOVER_M].
          The Mapbox camera projects this world-space point to screen space
          correctly at any pitch or heading — no screen-pixel drift.

          anchor y:1.0 pins the bottom of the VenueOrb view to that
          projected point, so the orb floats just above the tower top.
         ══════════════════════════════════════════════════════════════════ */}
      {validVenues.map((v) => {
        const bpm        = bpmMap.get(v.id) ?? 0;
        const type       = venueType(v.kind);
        const isSelected = v.id === selectedVenueId;
        const color      = isSelected ? SELECTED_COLOR : TYPE_COLOR[type];
        const { coreSize, pulseScale } = bpmToOrbProps(bpm);

        // Selected orbs get a +3px core bump so they stand out clearly
        const finalCoreSize = isSelected ? coreSize + 3 : coreSize;

        // Match the exact height used in the extrusion layers so the orb
        // coordinate aligns with the actual rendered tower top in 3D space.
        const towerHeight = isSelected
          ? Math.round(bpmToHeight(bpm) * 1.25)
          : bpmToHeight(bpm);

        return (
          <Mapbox.MarkerView
            key={String(v.id)}
            id={`vl-orb-${v.id}`}
            coordinate={[Number(v.longitude), Number(v.latitude), towerHeight + ORB_HOVER_M]}
            anchor={{ x: 0.5, y: 1.0 }}
          >
            {/* anchor y:1.0 pins the orb's bottom edge to the 3D coord.
                The orb centre therefore sits outer_radius/2 px above the
                projected tower top — naturally "just above" without any
                extra pixel offset that could drift with the camera. */}
            <View pointerEvents="none" style={{ alignItems: "center" }}>
              <VenueOrb
                color={color}
                coreSize={finalCoreSize}
                pulseScale={pulseScale}
              />
            </View>
          </Mapbox.MarkerView>
        );
      })}

    </>
  );
}
