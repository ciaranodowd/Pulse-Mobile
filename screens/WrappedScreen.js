// screens/WrappedScreen.js — Pulse Wrapped: Last Night
//
// Props:
//   session       — Supabase session
//   venues        — venues array from App.js (for name lookup)
//   onNavigate    — callback(tabName) to switch tab
//   onClose       — close the modal

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Animated, Easing, ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase";

// ── Design tokens ─────────────────────────────────────────────────────────────
const G = {
  bg:        "#05020E",
  bgCard:    "rgba(18, 10, 36, 0.96)",
  border:    "rgba(168, 85, 247, 0.35)",
  borderViv: "rgba(168, 85, 247, 0.65)",
  shadow:    "#A855F7",
  purple:    "#d8b4fe",
  purpleMid: "#a855f7",
  purpleDim: "rgba(168,85,247,0.45)",
  cyan:      "#00e5ff",
};

// ── Rotating funny lines — deterministic by day so it doesn't flicker ─────────
const PULSE_LINES = [
  "You said one pint.",
  "Absolute scenes.",
  "Are you feared? You should be.",
  "Where did you actually end up…",
  "The night had other plans.",
  "Legend. Allegedly.",
  "Galway never disappoints.",
  "Some questions are better left unanswered.",
  "Solid commitment. Questionable decisions.",
  "The bounce was real.",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPeakTime(pulses) {
  if (!pulses.length) return null;
  const counts = {};
  for (const p of pulses) {
    const d = new Date(p.created_at);
    const h = d.getHours();
    const half = d.getMinutes() < 30 ? "00" : "30";
    const key = `${h}:${half}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [hStr, mStr] = top[0].split(":");
  const h = Number(hStr);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr}${suffix}`;
}

function topVenueId(pulses) {
  const counts = {};
  for (const p of pulses) {
    if (p.venue_id) counts[p.venue_id] = (counts[p.venue_id] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function computeNightType(pulses, venueCount) {
  if (!pulses.length) return null;
  const lateCount = pulses.filter((p) => {
    const h = new Date(p.created_at).getHours();
    return h >= 2 && h < 6;
  }).length;
  if (lateCount > pulses.length * 0.4) return "Late night warrior";
  if (venueCount >= 3)                 return "Roaming night";
  if (venueCount === 1 && pulses.length >= 4) return "Stayed loyal";
  if (pulses.length <= 2)              return "Quick in and out";
  return "Solid night out";
}

// ── Animated card wrapper ─────────────────────────────────────────────────────
function AnimCard({ anim, children, style }) {
  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WrappedScreen({ session, venues = [], onNavigate, onClose }) {
  const [loading, setLoading]     = useState(true);
  const [userPulses, setUserPulses] = useState([]);
  const [cityPulses, setCityPulses] = useState([]);

  // 4 animated values — one per card
  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  // ── Fetch last-night data ─────────────────────────────────────────────────
  useEffect(() => {
    const fetch = async () => {
      // "last night" = last 20 hours (covers an evening + overnight)
      const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

      const [userRes, cityRes] = await Promise.all([
        supabase
          .from("pulses")
          .select("id, created_at, venue_id, source")
          .eq("user_id", session.user.id)
          .gte("created_at", since)
          .order("created_at", { ascending: true }),
        supabase
          .from("pulses")
          .select("id, created_at, venue_id")
          .gte("created_at", since)
          .not("venue_id", "is", null),
      ]);

      setUserPulses(userRes.data || []);
      setCityPulses(cityRes.data || []);
      setLoading(false);
    };
    fetch();
  }, [session?.user?.id]);

  // ── Staggered entrance once data arrives ──────────────────────────────────
  useEffect(() => {
    if (loading) return;
    Animated.stagger(
      130,
      anims.map((a) =>
        Animated.timing(a, {
          toValue:  1,
          duration: 380,
          easing:   Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [loading]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const venueNameMap = new Map(venues.map((v) => [v.id, v.name]));

  const userVenueIds  = [...new Set(userPulses.map((p) => p.venue_id).filter(Boolean))];
  const userTopId     = topVenueId(userPulses);
  const userTopName   = userTopId ? (venueNameMap.get(userTopId) || "a local spot") : null;
  const userPeakTime  = formatPeakTime(userPulses);
  const nightType     = computeNightType(userPulses, userVenueIds.length);

  const cityTopId    = topVenueId(cityPulses);
  const cityTopName  = cityTopId ? (venueNameMap.get(cityTopId) || "somewhere busy") : null;
  const cityPeakTime = formatPeakTime(cityPulses);

  const pulseLine = PULSE_LINES[new Date().getDate() % PULSE_LINES.length];

  const hasUserData = userPulses.length > 0;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={G.purpleMid} size="large" />
        <Text style={s.loadingText}>Recapping your night…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Close button */}
      <Pressable style={s.closeBtn} onPress={onClose} hitSlop={12}>
        <Text style={s.closeBtnText}>✕</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.headerEyebrow}>PULSE WRAPPED</Text>
          <Text style={s.headerTitle}>Last Night{"\n"}in Galway</Text>
          <Text style={s.headerSub}>In case you forgot…</Text>
        </View>

        {/* ── Card 1: Your Night ── */}
        <AnimCard anim={anims[0]}>
          <View style={s.card}>
            <Text style={s.cardLabel}>YOUR NIGHT</Text>
            {hasUserData ? (
              <>
                <Text style={s.cardStat}>
                  {userVenueIds.length > 0
                    ? `You hit ${userVenueIds.length} ${userVenueIds.length === 1 ? "venue" : "venues"}`
                    : `${userPulses.length} pulses sent`}
                </Text>
                {userTopName && (
                  <Text style={s.cardDetail}>Top spot: <Text style={s.cardDetailBold}>{userTopName}</Text></Text>
                )}
                <Text style={s.cardDetail}>
                  {userPulses.length} {userPulses.length === 1 ? "pulse" : "pulses"} sent
                </Text>
              </>
            ) : (
              <>
                <Text style={s.cardStat}>Quiet one?</Text>
                <Text style={s.cardDetail}>No pulses last night — ghost mode activated.</Text>
              </>
            )}
          </View>

          {/* Night type badge — sits between card 1 and card 2 */}
          {nightType && (
            <View style={s.nightTypeBadge}>
              <Text style={s.nightTypeText}>{nightType}</Text>
            </View>
          )}
        </AnimCard>

        {/* ── Card 2: Your Timing ── */}
        <AnimCard anim={anims[1]}>
          <View style={s.card}>
            <Text style={s.cardLabel}>YOUR TIMING</Text>
            {userPeakTime ? (
              <>
                <Text style={s.cardStat}>Most active{"\n"}around {userPeakTime}</Text>
                <Text style={s.cardDetail}>Based on your pulse activity</Text>
              </>
            ) : (
              <>
                <Text style={s.cardStat}>Early doors?</Text>
                <Text style={s.cardDetail}>Not enough data from last night.</Text>
              </>
            )}
          </View>
        </AnimCard>

        {/* ── Card 3: Galway Recap ── */}
        <AnimCard anim={anims[2]}>
          <View style={[s.card, s.cardCity]}>
            <Text style={[s.cardLabel, { color: G.cyan }]}>GALWAY LAST NIGHT</Text>
            {cityTopName ? (
              <>
                <Text style={s.cardStat}>
                  Busiest: <Text style={[s.cardStatInline, { color: G.cyan }]}>{cityTopName}</Text>
                </Text>
                {cityPeakTime && (
                  <Text style={s.cardDetail}>Peak city time: <Text style={s.cardDetailBold}>{cityPeakTime}</Text></Text>
                )}
                <Text style={s.cardDetail}>{cityPulses.length} pulses across Galway</Text>
              </>
            ) : (
              <>
                <Text style={s.cardStat}>Low key night</Text>
                <Text style={s.cardDetail}>The city was quiet — or everyone left their phones at home.</Text>
              </>
            )}
          </View>
        </AnimCard>

        {/* ── Card 4: Pulse Line ── */}
        <AnimCard anim={anims[3]}>
          <View style={[s.card, s.cardQuote]}>
            <Text style={s.quoteIcon}>⚡</Text>
            <Text style={s.quoteText}>"{pulseLine}"</Text>
          </View>
        </AnimCard>

        {/* ── CTA ── */}
        <Animated.View style={{ opacity: anims[3] }}>
          <Pressable
            style={s.ctaBtn}
            onPress={() => { onClose(); onNavigate("plans"); }}
          >
            <Text style={s.ctaBtnText}>Tonight's plans  →</Text>
          </Pressable>

          <Pressable style={s.ctaBtnSecondary} onPress={onClose}>
            <Text style={s.ctaBtnSecondaryText}>Back to map</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: G.bg,
  },
  scroll: {
    padding: 20,
    paddingTop: 64,
    paddingBottom: 48,
    gap: 14,
  },
  loadingText: {
    color: G.purpleDim,
    marginTop: 14,
    fontSize: 14,
    fontWeight: "700",
  },

  // ── Close button
  closeBtn: {
    position: "absolute",
    top: 54,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 16,
    fontWeight: "700",
  },

  // ── Header
  header: {
    marginBottom: 6,
    paddingRight: 44, // avoid close button
  },
  headerEyebrow: {
    color: G.purpleDim,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "900",
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  headerSub: {
    color: "rgba(200,180,255,0.50)",
    fontSize: 14,
    marginTop: 6,
  },

  // ── Cards
  card: {
    backgroundColor: G.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: G.border,
    padding: 22,
    gap: 6,
    shadowColor: G.shadow,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cardCity: {
    borderColor: "rgba(0,229,255,0.25)",
    shadowColor: "#00e5ff",
    shadowOpacity: 0.15,
  },
  cardQuote: {
    alignItems: "center",
    paddingVertical: 26,
    borderColor: "rgba(168,85,247,0.50)",
    shadowOpacity: 0.40,
  },

  cardLabel: {
    color: G.purpleDim,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  cardStat: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  cardStatInline: {
    fontSize: 22,
    fontWeight: "900",
  },
  cardDetail: {
    color: "rgba(200,180,255,0.55)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  cardDetailBold: {
    color: "rgba(200,180,255,0.85)",
    fontWeight: "800",
  },

  // ── Night type badge
  nightTypeBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    marginLeft: 4,
    backgroundColor: "rgba(168,85,247,0.14)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.40)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  nightTypeText: {
    color: G.purple,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // ── Quote card
  quoteIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quoteText: {
    color: G.purple,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 26,
    fontStyle: "italic",
    letterSpacing: 0.1,
  },

  // ── CTAs
  ctaBtn: {
    backgroundColor: "rgba(168,85,247,0.20)",
    borderWidth: 1.5,
    borderColor: G.borderViv,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 6,
    shadowColor: G.shadow,
    shadowOpacity: 0.50,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  ctaBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  ctaBtnSecondary: {
    alignItems: "center",
    paddingVertical: 14,
  },
  ctaBtnSecondaryText: {
    color: G.purpleDim,
    fontSize: 14,
    fontWeight: "700",
  },
});
