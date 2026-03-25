// screens/BoostDashboardScreen.js
// Business-side boost creation dashboard.
//
// Props:
//   managedVenueId   — OSM venue id from profiles.managed_venue_id
//   managedVenueName — display name from profiles.managed_venue_name
//   session          — Supabase session
//   onClose          — callback to close the modal

import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { supabase } from "../lib/supabase";
import BoostCard from "../components/BoostCard";

// ── Design tokens ─────────────────────────────────────────────────────────────
const G = {
  bg:         "rgba(10, 6, 20, 1.0)",
  bgCard:     "rgba(18, 10, 36, 0.95)",
  bgSubtle:   "rgba(24, 14, 46, 0.90)",
  border:     "rgba(168, 85, 247, 0.38)",
  borderViv:  "rgba(168, 85, 247, 0.65)",
  borderFaint:"rgba(168, 85, 247, 0.22)",
  shadow:     "#A855F7",
  purple:     "#d8b4fe",
  purpleMid:  "#a855f7",
  purpleDim:  "rgba(168,85,247,0.55)",
};

// ── Boost type options ────────────────────────────────────────────────────────
const BOOST_TYPES = [
  { id: "drinks_deal",    label: "Drinks Deal",  icon: "🍹" },
  { id: "free_entry",     label: "Free Entry",   icon: "🎟"  },
  { id: "event_starting", label: "Live Now",     icon: "🎵"  },
  { id: "quiet_now",      label: "Quiet Now",    icon: "😴"  },
  { id: "custom",         label: "Custom",       icon: "⚡"  },
];

// ── Duration options ─────────────────────────────────────────────────────────
const DURATIONS = [15, 30, 45, 60];

// ── Placeholder suggestions per type ─────────────────────────────────────────
const PLACEHOLDERS = {
  drinks_deal:    "e.g. 2 for 1 cocktails until midnight",
  free_entry:     "e.g. Free entry until 11:30 tonight",
  event_starting: "e.g. DJ starting now on the main floor",
  quiet_now:      "e.g. Quiet tonight — come in now",
  custom:         "Write your boost message…",
};

const MAX_MSG = 80;

// ─────────────────────────────────────────────────────────────────────────────
export default function BoostDashboardScreen({
  managedVenueId,
  managedVenueName,
  session,
  onClose,
}) {
  const [boostType,     setBoostType]     = useState("drinks_deal");
  const [message,       setMessage]       = useState("");
  const [duration,      setDuration]      = useState(30);
  const [tonightCount,  setTonightCount]  = useState(0);
  const [loadingCount,  setLoadingCount]  = useState(true);
  const [sending,       setSending]       = useState(false);
  const [error,         setError]         = useState("");
  const [successMsg,    setSuccessMsg]    = useState("");

  // ── Load tonight's boost count ────────────────────────────────────────────
  const loadCount = useCallback(async () => {
    if (!managedVenueId) return;
    setLoadingCount(true);
    try {
      const { data, error: err } = await supabase.rpc("get_tonight_boost_count", {
        p_venue_id: managedVenueId,
      });
      if (!err) setTonightCount(data ?? 0);
    } catch {}
    setLoadingCount(false);
  }, [managedVenueId]);

  useEffect(() => { loadCount(); }, [loadCount]);

  // ── Send boost ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    setError(""); setSuccessMsg("");
    if (!message.trim()) { setError("Please enter a message."); return; }
    if (message.length > MAX_MSG) { setError(`Message is too long (max ${MAX_MSG} chars).`); return; }
    if (tonightCount >= 2) { setError("You've used both boosts for tonight."); return; }

    setSending(true);
    try {
      const { data: boost, error: rpcErr } = await supabase.rpc("send_boost", {
        p_venue_id:         managedVenueId,
        p_venue_name:       managedVenueName,
        p_boost_type:       boostType,
        p_message:          message.trim(),
        p_duration_minutes: duration,
      });

      if (rpcErr) {
        setError(rpcErr.message || "Failed to send boost.");
        setSending(false);
        return;
      }

      // Fire-and-forget Edge Function to send push notifications
      if (boost?.id) {
        supabase.functions
          .invoke("notify-boost", { body: { boostId: boost.id } })
          .catch(() => {}); // non-blocking — notification failure is not fatal
      }

      await loadCount();
      setSuccessMsg("Boost sent! Users have been notified.");
      setMessage("");
      setBoostType("drinks_deal");
      setDuration(30);
    } catch (e) {
      setError(String(e?.message || "Unexpected error."));
    }
    setSending(false);
  };

  // ── Preview boost object ──────────────────────────────────────────────────
  const previewBoost = {
    id:         "preview",
    venue_id:   managedVenueId || "preview",
    venue_name: managedVenueName || "Your Venue",
    boost_type: boostType,
    message:    message.trim() || PLACEHOLDERS[boostType],
    expires_at: new Date(Date.now() + duration * 60 * 1000).toISOString(),
  };

  const boostsLeft    = Math.max(0, 2 - tonightCount);
  const canSend       = !!message.trim() && message.length <= MAX_MSG && boostsLeft > 0 && !sending;
  const charCount     = message.length;
  const charOver      = charCount > MAX_MSG;

  if (!managedVenueId || !managedVenueName) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏢</Text>
          <Text style={styles.emptyTitle}>No venue assigned</Text>
          <Text style={styles.emptyBody}>
            Your account has not been linked to a venue yet.{"\n"}
            Contact Pulse support to set up your business account.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <View style={styles.businessBadgeRow}>
              <View style={styles.businessBadge}>
                <Text style={styles.businessBadgeText}>VENUE BUSINESS</Text>
              </View>
            </View>
            <Text style={styles.venueName}>{managedVenueName}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        {/* ── Tonight's usage ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.usageRow}>
            <View>
              <Text style={styles.usageTitle}>Tonight's Boosts</Text>
              <Text style={styles.usageSub}>Limit resets at midnight</Text>
            </View>
            {loadingCount ? (
              <ActivityIndicator color={G.purpleMid} size="small" />
            ) : (
              <View style={styles.usagePips}>
                {[0, 1].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.usagePip,
                      i < tonightCount ? styles.usagePipUsed : styles.usagePipFree,
                    ]}
                  />
                ))}
                <Text style={styles.usageCount}>
                  {tonightCount} of 2 used
                </Text>
              </View>
            )}
          </View>

          {tonightCount >= 2 && (
            <View style={styles.limitReached}>
              <Text style={styles.limitReachedText}>
                Both boosts used tonight. Come back after midnight.
              </Text>
            </View>
          )}
        </View>

        {/* ── Boost type picker ───────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Boost Type</Text>
        <View style={styles.pillRow}>
          {BOOST_TYPES.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.pill, boostType === t.id && styles.pillActive]}
              onPress={() => { setBoostType(t.id); setError(""); setSuccessMsg(""); }}
            >
              <Text style={styles.pillIcon}>{t.icon}</Text>
              <Text style={[styles.pillLabel, boostType === t.id && styles.pillLabelActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Message input ────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Message</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={(t) => { setMessage(t); setError(""); setSuccessMsg(""); }}
            placeholder={PLACEHOLDERS[boostType]}
            placeholderTextColor="rgba(168,85,247,0.35)"
            maxLength={MAX_MSG + 5}
            multiline
            numberOfLines={2}
            returnKeyType="done"
            blurOnSubmit
          />
          <Text style={[styles.charCount, charOver && styles.charCountOver]}>
            {charCount}/{MAX_MSG}
          </Text>
        </View>

        {/* ── Duration picker ──────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Duration</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map((d) => (
            <Pressable
              key={d}
              style={[styles.durationPill, duration === d && styles.durationPillActive]}
              onPress={() => { setDuration(d); setError(""); setSuccessMsg(""); }}
            >
              <Text style={[styles.durationLabel, duration === d && styles.durationLabelActive]}>
                {d}m
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Live preview ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Preview</Text>
        <BoostCard boost={previewBoost} preview />

        {/* ── Feedback messages ────────────────────────────────────────────── */}
        {!!error      && <Text style={styles.errorText}>{error}</Text>}
        {!!successMsg && <Text style={styles.successText}>{successMsg}</Text>}

        {/* ── Send button ──────────────────────────────────────────────────── */}
        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {sending
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.sendBtnText}>
                {boostsLeft === 0 ? "No boosts remaining tonight" : "Send Boost"}
              </Text>
          }
        </Pressable>

        <Text style={styles.disclaimer}>
          Boosts are visible to all Pulse users in real time.{"\n"}
          Be accurate — misleading boosts may result in account suspension.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: G.bg,
  },
  scroll: {
    padding: 18,
    paddingTop: 56,
    paddingBottom: 40,
    gap: 12,
  },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  businessBadgeRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  businessBadge: {
    backgroundColor: "rgba(168,85,247,0.18)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.50)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  businessBadgeText: {
    color: G.purple,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  venueName: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  closeBtnText: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 16,
    fontWeight: "700",
  },

  // ── Cards
  card: {
    backgroundColor: G.bgCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: G.border,
    padding: 16,
    shadowColor: G.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  // ── Usage / tonight counter
  usageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  usageTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  usageSub: {
    color: "rgba(168,85,247,0.55)",
    fontSize: 11,
    marginTop: 2,
  },
  usagePips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  usagePip: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  usagePipFree: {
    backgroundColor: "rgba(168,85,247,0.22)",
    borderWidth: 1.5,
    borderColor: "rgba(168,85,247,0.50)",
  },
  usagePipUsed: {
    backgroundColor: G.purpleMid,
    borderWidth: 0,
  },
  usageCount: {
    color: G.purple,
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 4,
  },
  limitReached: {
    marginTop: 12,
    backgroundColor: "rgba(255,70,102,0.10)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,70,102,0.30)",
    padding: 10,
  },
  limitReachedText: {
    color: "#ff6688",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  // ── Section labels
  sectionLabel: {
    color: "rgba(168,85,247,0.70)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 4,
    marginBottom: 2,
    marginLeft: 2,
  },

  // ── Boost type pills
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.08)",
    borderWidth: 1,
    borderColor: G.borderFaint,
  },
  pillActive: {
    backgroundColor: "rgba(168,85,247,0.22)",
    borderColor: G.borderViv,
    shadowColor: G.shadow,
    shadowOpacity: 0.40,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  pillIcon: { fontSize: 14 },
  pillLabel: {
    color: "rgba(168,85,247,0.55)",
    fontSize: 13,
    fontWeight: "700",
  },
  pillLabelActive: {
    color: G.purple,
    fontWeight: "900",
  },

  // ── Message input
  input: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    minHeight: 52,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  charCount: {
    color: "rgba(168,85,247,0.45)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    marginTop: 4,
  },
  charCountOver: {
    color: "#ff4466",
  },

  // ── Duration pills
  durationRow: {
    flexDirection: "row",
    gap: 10,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(168,85,247,0.08)",
    borderWidth: 1,
    borderColor: G.borderFaint,
    alignItems: "center",
  },
  durationPillActive: {
    backgroundColor: "rgba(168,85,247,0.22)",
    borderColor: G.borderViv,
    shadowColor: G.shadow,
    shadowOpacity: 0.40,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  durationLabel: {
    color: "rgba(168,85,247,0.55)",
    fontSize: 14,
    fontWeight: "800",
  },
  durationLabelActive: {
    color: G.purple,
  },

  // ── Feedback
  errorText: {
    color: "#ff6688",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "rgba(255,70,102,0.08)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,70,102,0.25)",
  },
  successText: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "rgba(74,222,128,0.08)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
  },

  // ── Send button
  sendBtn: {
    backgroundColor: "rgba(168,85,247,0.22)",
    borderWidth: 1.5,
    borderColor: G.borderViv,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: G.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  sendBtnDisabled: {
    opacity: 0.40,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  // ── Disclaimer
  disclaimer: {
    color: "rgba(168,85,247,0.35)",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 4,
  },

  // ── Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { color: "#fff", fontSize: 20, fontWeight: "900", textAlign: "center" },
  emptyBody:  { color: "rgba(255,255,255,0.45)", fontSize: 14, textAlign: "center", lineHeight: 20 },
});
