// MapRippleLayer.js — Geo-referenced pulse ripple using Mapbox native layers
// Updates a GeoJSON polygon source at ~30fps during the short animation window.
// All drawing is map-native (FillLayer + LineLayer) — no React animated views.

import React, { useEffect, useRef, useState } from "react";
import Mapbox from "@rnmapbox/maps";

const RINGS      = 3;
const DURATION   = 1800;   // ms per ring expand
const MAX_RADIUS = 100;    // metres — slightly wider for more drama
const STAGGER    = 380;    // ms between rings
const TOTAL      = DURATION + STAGGER * (RINGS - 1);
const TICK_MS    = 33;     // ~30fps

const RING_COLORS = [
  [168, 85,  247],   // purple
  [236, 72,  153],   // pink
  [34,  211, 238],   // cyan
];

const EMPTY = { type: "FeatureCollection", features: [] };

/** Generate a GeoJSON polygon ring that approximates a circle in geo-space. */
function geoCirclePolygon(lngCenter, latCenter, radiusM, steps = 32) {
  const R     = 6371000;
  const lat1  = (latCenter * Math.PI) / 180;
  const lon1  = (lngCenter * Math.PI) / 180;
  const d     = radiusM / R;
  const coords = [];

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2    = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
    );
    const lon2    = lon1 + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return coords;
}

export default function MapRippleLayer({ latitude, longitude, pulseKey }) {
  const [geojson, setGeojson] = useState(EMPTY);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!latitude || !longitude || !pulseKey) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const start = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed  = Date.now() - start;
      const features = [];

      for (let i = 0; i < RINGS; i++) {
        const re = elapsed - i * STAGGER;
        if (re <= 0) continue;

        const t       = Math.min(re / DURATION, 1);
        const radius  = MAX_RADIUS * (1 - Math.pow(1 - t, 2));
        const rawOp   = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
        const opacity = Math.max(0, rawOp);
        if (radius < 2 || opacity < 0.01) continue;

        const [r, g, b] = RING_COLORS[i];
        const strokeOp  = (opacity * 0.90).toFixed(3);

        features.push({
          type: "Feature",
          properties: {
            strokeColor: `rgba(${r},${g},${b},${strokeOp})`,
          },
          geometry: {
            type:        "Polygon",
            coordinates: [geoCirclePolygon(longitude, latitude, radius)],
          },
        });
      }

      setGeojson({ type: "FeatureCollection", features });

      if (elapsed >= TOTAL + 50) {
        clearInterval(timerRef.current);
        setGeojson(EMPTY);
      }
    }, TICK_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pulseKey]);  // intentionally not in deps: latitude/longitude (stable during animation)

  if (!latitude || !longitude) return null;

  return (
    <Mapbox.ShapeSource id="rippleSource" shape={geojson}>
      {/* Bloom glow — wide blurred halo around each ring for premium depth */}
      <Mapbox.LineLayer
        id="rippleBloom"
        style={{
          lineColor:   ["get", "strokeColor"],
          lineWidth:   10,
          lineOpacity: 0.18,
          lineBlur:    4,
        }}
      />
      {/* Core ring — crisp outline, slightly thicker than before */}
      <Mapbox.LineLayer
        id="rippleLine"
        style={{
          lineColor:   ["get", "strokeColor"],
          lineWidth:   3,
          lineOpacity: 1,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
