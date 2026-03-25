// components/BoostCard.js
// Consumer-facing boost card — used in TonightPlansScreen and the business preview.
//
// Props:
//   boost           — boost row object { id, venue_name, boost_type, message, expires_at, venue_id }
//   onViewVenue     — optional callback(venueId, venueName) — navigate to map/venue
//   preview         — boolean: if true, disables countdown & CTA (used in dashboard preview)

import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

// ── Design tokens (matches App.js G palette) ──────────────────────────────────
const G = {
  bgDeep:     "rgba(8, 4, 18, 0.97)",
  bgSubtle:   "rgba(18, 10, 36, 0.90)",
  border:     "rgba(168, 85, 247, 0.38)",
  borderViv:  "rgba(168, 85, 247, 0.65)",
  shadow:     "#A855F7",
};

// ── Boost type metadata ───────────────────────────────────────────────────────
const BOOST_META = {
  drinks_deal:    { label: "Drinks Deal",  icon: "🍹", color: "#00e5ff", bg: "rgba(0,229,255,0.13)"  },
  free_entry:     { label: "Free Entry",   icon: "🎟",  color: "#ffd166", bg: "rgba(255,209,102,0.13)" },
  event_starting: { label: "Live Now",     icon: "🎵",  color: "#4ade80", bg: "rgba(74,222,128,0.13)" },
  quiet_now:      { label: "Quiet Now",    icon: "😴",  color: "#94a3b8", bg: "rgba(148,163,184,0.13)" },
  custom:         { label: "Special",      icon: "⚡",  color: "#d8b4fe", bg: "rgba(168,85,247,0.18)" },
};

// ── Countdown helper ──────────────────────────────────────────────────────────
function useCountdown(expiresAt) {
  const getSecondsLeft = () =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

  const [secondsLeft, setSecondsLeft] = useState(getSecondsLeft);

  useEffect(() => {
    if (!expiresAt) return;
    setSecondsLeft(getSecondsLeft());
    const interval = setInterval(() => {
      const s = getSecondsLeft();
      setSecondsLeft(s);
      if (s <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (secondsLeft <= 0) return "Expired";
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return m > 0 ? `${m}m ${s}s left` : `${s}s left`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BoostCard({ boost, onViewVenue, preview = false }) {
  const meta      = BOOST_META[boost.boost_type] || BOOST_META.custom;
  const countdown = useCountdown(preview ? null : boost.expires_at);
  const expired   = !preview && countdown === "Expired";

  if (expired) return null;

  return (
    <View style={styles.card}>
      {/* Purple left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: meta.color }]} />

      <View style={styles.body}>
        {/* Row 1: venue name + type badge */}
        <View style={styles.topRow}>
          <Text style={styles.venueName} numberOfLines={1}>{boost.venue_name}</Text>
          <View style={[styles.typeBadge, { backgroundColor: meta.bg, borderColor: meta.color + "55" }]}>
            <Text style={styles.typeBadgeIcon}>{meta.icon}</Text>
            <Text style={[styles.typeBadgeLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {/* Row 2: message */}
        <Text style={styles.message}>{boost.message}</Text>

        {/* Row 3: countdown + CTA */}
        <View style={styles.bottomRow}>
          {!preview ? (
            <View style={styles.countdownWrap}>
              <Text style={styles.countdownDot}>●</Text>
              <Text style={styles.countdown}>{countdown}</Text>
            </View>
          ) : (
            <Text style={styles.previewLabel}>Preview</Text>
          )}

          {!preview && onViewVenue && (
            <Pressable
              style={styles.ctaBtn}
              onPress={() => onViewVenue(boost.venue_id, boost.venue_name)}
            >
              <Text style={styles.ctaBtnText}>View Venue</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: G.bgDeep,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: G.border,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: G.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  accentBar: {
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  venueName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
    flex: 1,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeBadgeIcon: { fontSize: 12 },
  typeBadgeLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  message: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  countdownWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  countdownDot: {
    color: "#A855F7",
    fontSize: 8,
  },
  countdown: {
    color: "#d8b4fe",
    fontSize: 12,
    fontWeight: "700",
  },
  previewLabel: {
    color: "rgba(168,85,247,0.55)",
    fontSize: 11,
    fontWeight: "700",
    fontStyle: "italic",
  },
  ctaBtn: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  ctaBtnText: {
    color: "#d8b4fe",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
