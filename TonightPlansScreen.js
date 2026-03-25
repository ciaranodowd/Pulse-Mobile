// TonightPlansScreen.js — Tonight's Plans feature
//
// SUPABASE TABLE REQUIRED (run once in Supabase SQL editor):
//
//   CREATE TABLE tonight_plans (
//     id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//     user_id    uuid REFERENCES auth.users NOT NULL,
//     venue_id   text NOT NULL,
//     plan_date  date NOT NULL,
//     created_at timestamptz DEFAULT now(),
//     updated_at timestamptz DEFAULT now(),
//     UNIQUE(user_id, plan_date)
//   );
//   ALTER TABLE tonight_plans ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "read all"   ON tonight_plans FOR SELECT USING (true);
//   CREATE POLICY "manage own" ON tonight_plans FOR ALL    USING (auth.uid() = user_id);
//
// PUSH NOTIFICATIONS (requires: expo install expo-notifications)
//   See the scaffolded handler in App.js for wiring instructions.

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, Modal,
  StyleSheet, Dimensions,
} from "react-native";
import { supabase } from "./lib/supabase";
import BoostCard from "./components/BoostCard";

// ── Theme (matches App.js G palette) ─────────────────────────────────────────
const G = {
  bg:         "rgba(10, 6, 20, 0.95)",
  bgSubtle:   "rgba(14, 9, 28, 0.85)",
  border:     "rgba(168, 85, 247, 0.40)",
  borderViv:  "rgba(168, 85, 247, 0.65)",
  borderCyan: "rgba(0, 229, 255, 0.50)",
  borderFaint:"rgba(168, 85, 247, 0.22)",
  shadow:     "#A855F7",
  cyan:       "#00e5ff",
  purple:     "#d8b4fe",
};

// ── Featured venues — matched by name substring against Overpass data ─────────
const FEATURED_VENUE_NAMES = [
  "Electric",
  "Coyotes",
  "Buskers",
  "Barr an Chaladh",
  "Hole in the Wall",
];

const todayISODate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const kindEmoji = (kind) => {
  const k = String(kind || "").toLowerCase();
  if (k.includes("pub"))   return "🍺";
  if (k.includes("bar"))   return "🍸";
  if (k.includes("night")) return "🎶";
  return "📍";
};

// ─────────────────────────────────────────────────────────────────────────────
// TonightPlansScreen
// Props:
//   venues          — array from Overpass (same as map)
//   leaderboard     — BPM rows from App.js leaderboard memo
//   session         — Supabase session
//   showPickerOnMount — true when opened from a push notification
// ─────────────────────────────────────────────────────────────────────────────
export default function TonightPlansScreen({ venues, leaderboard, session, showPickerOnMount, activeBoosts = [], onNavigateToMap, onOpenWrapped }) {
  const [plans,          setPlans]          = useState({});   // { venueId: count }
  const [myPlanVenueId,  setMyPlanVenueId]  = useState(null);
  const [selectedVenueId,setSelectedVenueId]= useState(null);
  const [showPicker,     setShowPicker]     = useState(!!showPickerOnMount);
  const [submitting,     setSubmitting]     = useState(false);

  // Keep picker open-state in sync when the prop changes (e.g. notification arrives)
  useEffect(() => { setShowPicker(!!showPickerOnMount); }, [showPickerOnMount]);

  // ── Derive featured + other venue lists ──────────────────────────────────
  const featuredVenues = FEATURED_VENUE_NAMES
    .map((name) => venues.find((v) => v.name?.toLowerCase().includes(name.toLowerCase())))
    .filter(Boolean);

  const featuredIds  = new Set(featuredVenues.map((v) => v.id));
  const otherVenues  = venues
    .filter((v) => !featuredIds.has(v.id))
    .sort((a, b) => (plans[b.id] || 0) - (plans[a.id] || 0));

  const selectedVenue       = venues.find((v) => v.id === selectedVenueId) || null;
  const selectedLeaderboard = leaderboard.find((r) => r.venueId === selectedVenueId) || null;

  const totalPlans = Object.values(plans).reduce((s, c) => s + c, 0);
  const maxPlans   = Math.max(...Object.values(plans), 1);

  // ── Top trending (by plan count, then by BPM) ────────────────────────────
  const topByPlans = [...featuredVenues, ...otherVenues]
    .filter((v) => (plans[v.id] || 0) > 0 || leaderboard.find((r) => r.venueId === v.id))
    .sort((a, b) => {
      const pd = (plans[b.id] || 0) - (plans[a.id] || 0);
      if (pd !== 0) return pd;
      const la = leaderboard.find((r) => r.venueId === a.id)?.bpm || 0;
      const lb = leaderboard.find((r) => r.venueId === b.id)?.bpm || 0;
      return lb - la;
    })
    .slice(0, 5);

  // ── Supabase: load plan counts ────────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("tonight_plans")
        .select("venue_id")
        .eq("plan_date", todayISODate());
      const counts = {};
      (data || []).forEach((r) => { counts[r.venue_id] = (counts[r.venue_id] || 0) + 1; });
      setPlans(counts);
    } catch { /* table may not exist yet — show zeros */ }
  }, []);

  // ── Supabase: load my plan for today ─────────────────────────────────────
  const loadMyPlan = useCallback(async () => {
    if (!session?.user) return;
    try {
      const { data } = await supabase
        .from("tonight_plans")
        .select("venue_id")
        .eq("user_id", session.user.id)
        .eq("plan_date", todayISODate())
        .maybeSingle();
      setMyPlanVenueId(data?.venue_id || null);
    } catch {}
  }, [session?.user?.id]);

  useEffect(() => { loadPlans(); loadMyPlan(); }, [loadPlans, loadMyPlan]);

  // ── Supabase: add / update my plan ───────────────────────────────────────
  const addMyPlan = async (venue) => {
    if (!session?.user || submitting) return;
    setSubmitting(true);
    try {
      await supabase.from("tonight_plans").upsert(
        { user_id: session.user.id, venue_id: venue.id, plan_date: todayISODate() },
        { onConflict: "user_id,plan_date" }
      );
      setMyPlanVenueId(venue.id);
      await loadPlans();
    } catch (e) { console.warn("[Plans] upsert error", e); }
    setSubmitting(false);
  };

  const selectVenue = (venue) => { setSelectedVenueId(venue.id); setShowPicker(false); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Tonight's Plans</Text>
            <Text style={s.headerSub}>
              {totalPlans > 0
                ? `${totalPlans} ${totalPlans === 1 ? "plan" : "plans"} locked in tonight`
                : "Be the first to plan your night"}
            </Text>
          </View>
          {onOpenWrapped && (
            <Pressable style={s.wrappedBtn} onPress={onOpenWrapped}>
              <Text style={s.wrappedBtnIcon}>🌙</Text>
              <Text style={s.wrappedBtnText}>Last Night</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Live Boosts section ── */}
        {activeBoosts.length > 0 && (
          <View style={s.boostsSection}>
            <View style={s.boostsSectionHeader}>
              <Text style={s.boostsSectionTitle}>Live Boosts</Text>
              <View style={s.boostsLiveDot}>
                <Text style={s.boostsLiveDotText}>● LIVE</Text>
              </View>
            </View>
            <View style={s.boostsGap}>
              {activeBoosts.map((boost) => (
                <BoostCard
                  key={boost.id}
                  boost={boost}
                  onViewVenue={onNavigateToMap ? () => onNavigateToMap() : undefined}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Selected venue detail card ── */}
        {selectedVenue && (
          <View style={s.detailCard}>
            <View style={s.detailHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.detailEmoji}>{kindEmoji(selectedVenue.kind)}</Text>
                <Text style={s.detailName} numberOfLines={1}>{selectedVenue.name}</Text>
                <Text style={s.detailKind}>{selectedVenue.kind?.toUpperCase()}</Text>
              </View>
              {myPlanVenueId === selectedVenue.id && (
                <View style={s.myPlanBadge}>
                  <Text style={s.myPlanBadgeText}>✓ My plan</Text>
                </View>
              )}
            </View>

            <View style={s.detailStats}>
              <View style={s.detailStat}>
                <Text style={s.detailStatValue}>{plans[selectedVenue.id] || 0}</Text>
                <Text style={s.detailStatLabel}>Planning tonight</Text>
              </View>
              {selectedLeaderboard ? (
                <>
                  <View style={s.detailStat}>
                    <Text style={[s.detailStatValue, { color: G.cyan }]}>
                      {selectedLeaderboard.bpm.toFixed(1)}
                    </Text>
                    <Text style={s.detailStatLabel}>BPM now</Text>
                  </View>
                  <View style={s.detailStat}>
                    <Text style={s.detailStatValue}>{selectedLeaderboard.goingNow}</Text>
                    <Text style={s.detailStatLabel}>Going now</Text>
                  </View>
                </>
              ) : null}
              {totalPlans > 0 && (
                <View style={s.detailStat}>
                  <Text style={s.detailStatValue}>
                    {Math.round(((plans[selectedVenue.id] || 0) / totalPlans) * 100)}%
                  </Text>
                  <Text style={s.detailStatLabel}>Of plans</Text>
                </View>
              )}
            </View>

            {/* Popularity bar */}
            {totalPlans > 0 && (
              <View style={s.barTrack}>
                <View
                  style={[
                    s.barFill,
                    { width: `${Math.max(4, Math.round(((plans[selectedVenue.id] || 0) / maxPlans) * 100))}%` },
                  ]}
                />
              </View>
            )}

            {/* CTA */}
            <Pressable
              style={[s.ctaBtn, myPlanVenueId === selectedVenue.id && s.ctaBtnDone]}
              onPress={() => addMyPlan(selectedVenue)}
              disabled={submitting || myPlanVenueId === selectedVenue.id}
            >
              <Text style={s.ctaBtnText}>
                {submitting
                  ? "Adding…"
                  : myPlanVenueId === selectedVenue.id
                  ? "✓ I'm going here tonight"
                  : "I'm going here tonight"}
              </Text>
            </Pressable>

            <Pressable style={s.changeBtn} onPress={() => setSelectedVenueId(null)}>
              <Text style={s.changeBtnText}>Change venue</Text>
            </Pressable>
          </View>
        )}

        {/* ── Trending tonight ── */}
        {topByPlans.length > 0 && (
          <>
            <Text style={s.sectionTitle}>🔥 Trending Tonight</Text>
            {topByPlans.map((v, i) => {
              const lb = leaderboard.find((r) => r.venueId === v.id);
              const pct = Math.max(4, Math.round(((plans[v.id] || 0) / maxPlans) * 100));
              return (
                <Pressable
                  key={v.id}
                  style={[s.trendRow, selectedVenueId === v.id && s.trendRowSelected]}
                  onPress={() => selectVenue(v)}
                >
                  <Text style={s.trendRank}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.trendName} numberOfLines={1}>{v.name}</Text>
                    <View style={s.trendBarTrack}>
                      <View style={[s.trendBarFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", minWidth: 60 }}>
                    <Text style={s.trendCount}>{plans[v.id] || 0} 🎯</Text>
                    {lb ? <Text style={s.trendBpm}>{lb.bpm.toFixed(1)} bpm</Text> : null}
                  </View>
                  {myPlanVenueId === v.id ? <Text style={s.myCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
            <View style={s.divider} />
          </>
        )}

        {/* ── Featured venues ── */}
        <Text style={s.sectionTitle}>⭐ Featured Venues</Text>
        {featuredVenues.length === 0 ? (
          <Text style={s.emptyText}>Open the Map tab first to load nearby venues</Text>
        ) : (
          <View style={s.featuredGrid}>
            {featuredVenues.map((v) => (
              <Pressable
                key={v.id}
                style={[s.featuredCard, selectedVenueId === v.id && s.featuredCardSelected]}
                onPress={() => selectVenue(v)}
              >
                <Text style={s.featuredEmoji}>{kindEmoji(v.kind)}</Text>
                <Text style={s.featuredName} numberOfLines={2}>{v.name}</Text>
                <Text style={s.featuredCount}>{plans[v.id] || 0}</Text>
                <Text style={s.featuredCountLabel}>planning</Text>
                {myPlanVenueId === v.id && (
                  <View style={s.myPlanMini}>
                    <Text style={s.myPlanMiniText}>My plan ✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* ── All other venues ── */}
        {otherVenues.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: 20 }]}>All Venues</Text>
            {otherVenues.map((v) => (
              <Pressable
                key={v.id}
                style={[s.venueRow, selectedVenueId === v.id && s.venueRowSelected]}
                onPress={() => selectVenue(v)}
              >
                <Text style={s.venueRowEmoji}>{kindEmoji(v.kind)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.venueRowName} numberOfLines={1}>{v.name}</Text>
                  <Text style={s.venueRowKind}>{v.kind?.toUpperCase()}</Text>
                </View>
                <Text style={s.venueRowCount}>{plans[v.id] || 0}</Text>
                {myPlanVenueId === v.id ? <Text style={s.myCheck}>✓</Text> : null}
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── Venue picker bottom sheet (notification flow) ── */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={s.pickerOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={s.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.pickerHandle} />
            <Text style={s.pickerTitle}>Where are you heading?</Text>
            <Text style={s.pickerSub}>Pick a venue to see tonight's plans</Text>

            <ScrollView
              style={{ maxHeight: Dimensions.get("window").height * 0.58 }}
              showsVerticalScrollIndicator={false}
            >
              {featuredVenues.length > 0 && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 4, marginBottom: 8 }]}>⭐ Featured</Text>
                  {featuredVenues.map((v) => (
                    <Pressable key={v.id} style={s.pickerRow} onPress={() => selectVenue(v)}>
                      <Text style={s.pickerRowEmoji}>{kindEmoji(v.kind)}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.pickerRowName}>{v.name}</Text>
                        <Text style={s.pickerRowCount}>
                          {plans[v.id] || 0} planning to go
                        </Text>
                      </View>
                      <Text style={{ color: G.purple, fontSize: 18 }}>›</Text>
                    </Pressable>
                  ))}
                </>
              )}

              {otherVenues.length > 0 && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 14, marginBottom: 8 }]}>All Venues</Text>
                  {otherVenues.map((v) => (
                    <Pressable key={v.id} style={s.pickerRow} onPress={() => selectVenue(v)}>
                      <Text style={s.pickerRowEmoji}>{kindEmoji(v.kind)}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.pickerRowName}>{v.name}</Text>
                        <Text style={s.pickerRowCount}>
                          {plans[v.id] || 0} planning to go
                        </Text>
                      </View>
                      <Text style={{ color: G.purple, fontSize: 18 }}>›</Text>
                    </Pressable>
                  ))}
                </>
              )}

              {featuredVenues.length === 0 && otherVenues.length === 0 && (
                <Text style={s.emptyText}>Open the Map tab first to load nearby venues</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: "#05020E" },
  scroll:     { padding: 14, paddingBottom: 48 },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 58, paddingHorizontal: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(168,85,247,0.20)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  headerTitle: { color: "#fff", fontSize: 26, fontWeight: "900", letterSpacing: 0.5 },
  headerSub:   { color: "rgba(200,180,255,0.60)", fontSize: 13, marginTop: 4 },
  wrappedBtn: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.38)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    gap: 3,
    marginBottom: 2,
  },
  wrappedBtnIcon: { fontSize: 16 },
  wrappedBtnText: { color: "#d8b4fe", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  // ── Section label ──────────────────────────────────────────────────────────
  sectionTitle: { color: "#d8b4fe", fontSize: 14, fontWeight: "800", marginBottom: 10, marginTop: 4 },
  emptyText:    { color: "rgba(168,85,247,0.45)", fontSize: 13, marginBottom: 16 },
  divider:      { height: 1, backgroundColor: "rgba(168,85,247,0.14)", marginVertical: 16 },

  // ── Selected venue detail card ─────────────────────────────────────────────
  detailCard: {
    backgroundColor: G.bg, borderRadius: 22,
    borderWidth: 1.5, borderColor: G.borderViv,
    padding: 16, marginBottom: 20, gap: 12,
    shadowColor: G.shadow, shadowOpacity: 0.50, shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 }, elevation: 14,
  },
  detailHeaderRow:  { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailEmoji:      { fontSize: 28, marginBottom: 2 },
  detailName:       { color: "#fff", fontSize: 20, fontWeight: "900" },
  detailKind:       { color: "rgba(200,180,255,0.55)", fontSize: 11, marginTop: 2 },
  myPlanBadge: {
    backgroundColor: "rgba(0,229,255,0.16)", borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(0,229,255,0.45)",
  },
  myPlanBadgeText: { color: "#00e5ff", fontWeight: "900", fontSize: 12 },

  detailStats:     { flexDirection: "row", gap: 8, justifyContent: "space-around" },
  detailStat:      { alignItems: "center", flex: 1 },
  detailStatValue: { color: "#fff", fontSize: 22, fontWeight: "900" },
  detailStatLabel: { color: "rgba(200,180,255,0.60)", fontSize: 10, marginTop: 2, textAlign: "center" },

  barTrack: {
    height: 6, backgroundColor: "rgba(168,85,247,0.12)", borderRadius: 999, overflow: "hidden",
  },
  barFill: {
    height: "100%", backgroundColor: "#a855f7", borderRadius: 999,
  },

  ctaBtn: {
    backgroundColor: "rgba(168,85,247,0.22)", borderRadius: 999,
    paddingVertical: 14, alignItems: "center",
    borderWidth: 1.5, borderColor: G.borderViv,
    shadowColor: G.shadow, shadowOpacity: 0.55, shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  ctaBtnDone:   { backgroundColor: "rgba(0,229,255,0.14)", borderColor: "rgba(0,229,255,0.50)" },
  ctaBtnText:   { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.5 },

  changeBtn:     { alignItems: "center", paddingVertical: 4 },
  changeBtnText: { color: "rgba(168,85,247,0.55)", fontSize: 12 },

  // ── Trending rows ──────────────────────────────────────────────────────────
  trendRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: G.bgSubtle, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: G.borderFaint,
  },
  trendRowSelected: {
    borderColor: G.borderViv, backgroundColor: "rgba(168,85,247,0.10)",
  },
  trendRank:       { color: "#d8b4fe", fontWeight: "900", width: 28, textAlign: "center" },
  trendName:       { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  trendBarTrack:   { height: 4, backgroundColor: "rgba(168,85,247,0.12)", borderRadius: 999, overflow: "hidden" },
  trendBarFill:    { height: "100%", backgroundColor: "rgba(168,85,247,0.70)", borderRadius: 999 },
  trendCount:      { color: "#d8b4fe", fontWeight: "900", fontSize: 13 },
  trendBpm:        { color: "rgba(0,229,255,0.70)", fontSize: 10, marginTop: 2 },
  myCheck:         { color: "#00e5ff", fontWeight: "900", marginLeft: 4, fontSize: 14 },

  // ── Featured venue cards ───────────────────────────────────────────────────
  featuredGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  featuredCard: {
    width: "47%", backgroundColor: G.bgSubtle, borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(168,85,247,0.28)",
    padding: 14, alignItems: "center", gap: 4,
    shadowColor: G.shadow, shadowOpacity: 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  featuredCardSelected: {
    borderColor: "#a855f7", backgroundColor: "rgba(168,85,247,0.14)", borderWidth: 2,
  },
  featuredEmoji:      { fontSize: 28 },
  featuredName:       { color: "#fff", fontSize: 13, fontWeight: "800", textAlign: "center" },
  featuredCount:      { color: "#d8b4fe", fontSize: 22, fontWeight: "900", marginTop: 4 },
  featuredCountLabel: { color: "rgba(200,180,255,0.50)", fontSize: 10 },
  myPlanMini: {
    backgroundColor: "rgba(0,229,255,0.14)", borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
    borderWidth: 1, borderColor: "rgba(0,229,255,0.40)",
  },
  myPlanMiniText: { color: "#00e5ff", fontSize: 10, fontWeight: "900" },

  // ── All venues rows ────────────────────────────────────────────────────────
  venueRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: G.bgSubtle, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "rgba(168,85,247,0.18)",
  },
  venueRowSelected: { borderColor: G.borderViv, backgroundColor: "rgba(168,85,247,0.10)" },
  venueRowEmoji:    { fontSize: 18 },
  venueRowName:     { color: "#fff", fontSize: 14, fontWeight: "700" },
  venueRowKind:     { color: "rgba(200,180,255,0.50)", fontSize: 10, marginTop: 2 },
  venueRowCount:    { color: "#d8b4fe", fontWeight: "900", fontSize: 14, minWidth: 22, textAlign: "right" },

  // ── Venue picker bottom sheet ──────────────────────────────────────────────
  pickerOverlay: {
    flex: 1, backgroundColor: "rgba(3,1,10,0.75)", justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "rgba(8,4,18,0.99)",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: G.border,
    padding: 20, paddingBottom: 42,
    shadowColor: G.shadow, shadowOpacity: 0.55, shadowRadius: 36,
    shadowOffset: { width: 0, height: -8 }, elevation: 30,
  },
  pickerHandle: {
    width: 38, height: 4, borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.35)",
    alignSelf: "center", marginBottom: 16,
  },
  pickerTitle:    { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 4 },
  pickerSub:      { color: "rgba(200,180,255,0.55)", fontSize: 13, textAlign: "center", marginBottom: 16 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: G.bgSubtle, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: G.borderFaint,
  },
  pickerRowEmoji: { fontSize: 22 },
  pickerRowName:  { color: "#fff", fontSize: 15, fontWeight: "800" },
  pickerRowCount: { color: "rgba(200,180,255,0.55)", fontSize: 12, marginTop: 2 },

  // ── Live Boosts section ──────────────────────────────────────────────────
  boostsSection: {
    marginBottom: 4,
  },
  boostsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  boostsSectionTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  boostsLiveDot: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.45)",
  },
  boostsLiveDotText: {
    color: "#d8b4fe",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  boostsGap: {
    gap: 10,
  },
});
