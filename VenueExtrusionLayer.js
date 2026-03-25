// VenueExtrusionLayer.js — compact anchored venue beacons
//
// Layer system (bottom → top):
//   venue-beacon-body  — thin pillar body (FillExtrusion, 4m×4m footprint)
//   venue-beacon-cap   — bright neon top cap (FillExtrusion, same footprint)
//   venue-base-glow    — flat ground-plane halo (CircleLayer, pitchAlign:map)
//
// Venue colours:
//   pub  → neon yellow  (#FFE000)
//   bar  → bright purple (#CC00FF)
//   club → cyan          (#00DDFF)
//
// Activity scaling (beamActivity 0–1, from leaderboard BPM):
//   beaconH = lerp(IDLE_H=10, MAX_H=60, activity)  — pillar height in metres
//   capTop  = beaconH + lerp(3, 8, activity)        — cap top in metres
//   glow radius: lerp(10, 18, activity) px
//   glow opacity: lerp(0.15, 0.35, activity)
//
// No zoom expressions anywhere — activity-only scaling.

import React, { useMemo } from "react";
import Mapbox from "@rnmapbox/maps";

const MAX_BEAM_BPM = 15;

// Beacon dimensions
const IDLE_H   = 10;  // metres — visible stub at zero activity
const MAX_H    = 60;  // metres — full activity height
const IDLE_CAP =  3;  // cap thickness (metres) at idle
const MAX_CAP  =  8;  // cap thickness at full activity
const HALF_W   =  2;  // half-width of square footprint in metres → 4m × 4m total

// ─── Geometry helpers ────────────────────────────────────────────────────────

function tinySquare(lat, lon) {
  const mPerDegLat = 111_000;
  const mPerDegLon = 111_000 * Math.cos((lat * Math.PI) / 180);
  const dLat = HALF_W / mPerDegLat;
  const dLon = HALF_W / mPerDegLon;
  return {
    type: "Polygon",
    coordinates: [[
      [lon - dLon, lat - dLat],
      [lon + dLon, lat - dLat],
      [lon + dLon, lat + dLat],
      [lon - dLon, lat + dLat],
      [lon - dLon, lat - dLat],
    ]],
  };
}

const fc = (features) => ({ type: "FeatureCollection", features });

// ─── Venue type ───────────────────────────────────────────────────────────────
function venueType(kind) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("nightclub") || k.includes("speakeasy") || k === "club") return "club";
  if (k.includes("bar") || k.includes("cocktail") || k.includes("lounge")) return "bar";
  return "pub";
}

// ─── BPM → scale (exported for callers) ──────────────────────────────────────
export function bpmToScale(bpm) {
  if (bpm >= 10) return 2.2;
  if (bpm >= 4)  return 1.5;
  if (bpm >= 1)  return 1.1;
  return 1.0;
}

// ─── Colour expressions (data-driven, no zoom) ───────────────────────────────

// Body — darkened mid-tone of type colour
const bodyColor = [
  "case",
  ["==", ["get", "isSelected"], 1], "#007777",
  ["==", ["get", "venueType"], "pub"],  "#806000",
  ["==", ["get", "venueType"], "bar"],  "#440066",
  "#004455",  // club default
];

// Cap — full neon, bright highlight at beacon tip
const capColor = [
  "case",
  ["==", ["get", "isSelected"], 1], "#00FFFF",
  ["==", ["get", "venueType"], "pub"],  "#FFE000",
  ["==", ["get", "venueType"], "bar"],  "#CC00FF",
  "#00DDFF",  // club default
];

// Ground glow — same neon hue as cap
const glowColor = [
  "case",
  ["==", ["get", "isSelected"], 1], "#00FFFF",
  ["==", ["get", "venueType"], "pub"],  "#FFE000",
  ["==", ["get", "venueType"], "bar"],  "#CC00FF",
  "#00DDFF",  // club default
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function VenueExtrusionLayer({
  venues,
  leaderboard,
  selectedVenueId,
  reactingVenueIds,
  onPress,
}) {
  const { beaconsGj, orbsGj } = useMemo(() => {
    const beacons = [];
    const orbs    = [];

    const lbMap = new Map(
      (leaderboard || []).map((r) => [String(r.venueId), r.bpm ?? 0])
    );

    const reactSet = new Set();
    if (reactingVenueIds) reactingVenueIds.forEach((id) => reactSet.add(String(id)));

    (venues || [])
      .filter(
        (v) =>
          Number.isFinite(Number(v.latitude)) &&
          Number.isFinite(Number(v.longitude)),
      )
      .forEach((v) => {
        const lat  = Number(v.latitude);
        const lon  = Number(v.longitude);
        const id   = String(v.id);
        const type = venueType(v.kind);

        const isReacting = reactSet.has(id);
        const isSelected = String(v.id) === String(selectedVenueId);
        const bpm        = lbMap.get(id) ?? 0;
        const activity   = Math.min(1, Math.max(0, bpm / MAX_BEAM_BPM));

        // Compute heights from activity — stored as feature properties so
        // fillExtrusionHeight / fillExtrusionBase can reference them directly.
        const beaconH = IDLE_H + (MAX_H - IDLE_H) * activity;
        const capTop  = beaconH + IDLE_CAP + (MAX_CAP - IDLE_CAP) * activity;

        const props = {
          venueId:    id,
          venueType:  type,
          isSelected: isSelected ? 1 : 0,
          isActive:   (isReacting || isSelected) ? 1 : 0,
          activity,   // 0–1 used by glow interpolation
          beaconH,    // used by fillExtrusionHeight on body
          capTop,     // used by fillExtrusionHeight on cap
        };

        // Polygon → FillExtrusion beacon
        beacons.push({
          type: "Feature",
          id:   `${id}-beacon`,
          properties: props,
          geometry: tinySquare(lat, lon),
        });

        // Point → CircleLayer ground glow
        orbs.push({
          type: "Feature",
          id:   `${id}-orb`,
          properties: props,
          geometry: { type: "Point", coordinates: [lon, lat] },
        });
      });

    return { beaconsGj: fc(beacons), orbsGj: fc(orbs) };
  }, [venues, leaderboard, selectedVenueId, reactingVenueIds]);

  const handlePress = (e) => {
    const f = e?.features?.[0];
    if (!f) return;
    const venueId = f.properties?.venueId;
    const venue   = (venues || []).find((v) => String(v.id) === String(venueId));
    if (venue && onPress) onPress(venue);
  };

  return (
    <>
      {/* ── Beacon pillars ────────────────────────────────────────────────── */}
      {/* 4m×4m footprint extruded to activity-driven height.                */}
      {/* At 55° pitch this renders as a thin needle, not a chunky building. */}
      <Mapbox.ShapeSource id="venue-beacon-src" shape={beaconsGj} onPress={handlePress}>

        {/* Body — dark mid-tone pillar shaft */}
        <Mapbox.FillExtrusionLayer
          id="venue-beacon-body"
          style={{
            fillExtrusionColor:   bodyColor,
            fillExtrusionHeight:  ["case", ["==", ["get", "isActive"], 1],
              ["*", ["get", "beaconH"], 1.12],
              ["get", "beaconH"],
            ],
            fillExtrusionBase:    0,
            fillExtrusionOpacity: ["case", ["==", ["get", "isActive"], 1], 0.97, 0.88],
            fillExtrusionHeightTransition:  { duration: 350, delay: 0 },
            fillExtrusionOpacityTransition: { duration: 350, delay: 0 },
          }}
        />

        {/* Cap — bright neon top, sits above body */}
        <Mapbox.FillExtrusionLayer
          id="venue-beacon-cap"
          style={{
            fillExtrusionColor:   capColor,
            fillExtrusionHeight:  ["case", ["==", ["get", "isActive"], 1],
              ["*", ["get", "capTop"], 1.12],
              ["get", "capTop"],
            ],
            fillExtrusionBase:    ["case", ["==", ["get", "isActive"], 1],
              ["*", ["get", "beaconH"], 1.12],
              ["get", "beaconH"],
            ],
            fillExtrusionOpacity: ["case", ["==", ["get", "isActive"], 1], 1.0, 0.95],
            fillExtrusionHeightTransition:  { duration: 350, delay: 0 },
            fillExtrusionBaseTransition:    { duration: 350, delay: 0 },
            fillExtrusionOpacityTransition: { duration: 350, delay: 0 },
          }}
        />

      </Mapbox.ShapeSource>

      {/* ── Base glow — flat ground-plane halo ────────────────────────────── */}
      {/* circlePitchAlignment:"map" keeps the halo lying flat on the ground. */}
      {/* aboveLayerID="venue-beacon-cap" forces this CircleLayer above the   */}
      {/* FillExtrusion layers (rnmapbox default would bury it underneath).   */}
      <Mapbox.ShapeSource id="venue-glow-src" shape={orbsGj} onPress={handlePress}>
        <Mapbox.CircleLayer
          id="venue-base-glow"
          aboveLayerID="venue-beacon-cap"
          style={{
            circleRadius: ["case", ["==", ["get", "isActive"], 1],
              ["interpolate", ["linear"], ["get", "activity"], 0, 14, 1, 24],
              ["interpolate", ["linear"], ["get", "activity"], 0, 10, 1, 18],
            ],
            circleColor:   glowColor,
            circleOpacity: ["case", ["==", ["get", "isActive"], 1],
              ["interpolate", ["linear"], ["get", "activity"], 0, 0.28, 1, 0.52],
              ["interpolate", ["linear"], ["get", "activity"], 0, 0.15, 1, 0.35],
            ],
            circleBlur:           1.2,
            circlePitchAlignment: "map",
            circleRadiusTransition:  { duration: 350, delay: 0 },
            circleOpacityTransition: { duration: 350, delay: 0 },
          }}
        />
      </Mapbox.ShapeSource>
    </>
  );
}
