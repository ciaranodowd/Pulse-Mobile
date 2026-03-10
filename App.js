// App.js — Pulse (Expo Go / SDK 54 compatible)
// ✅ Friends by username
// ✅ FIXED pulse ripple — renders at ROOT level above native map layer
// ✅ MapRippleCircles inside MapView for georeferenced on-map ripple
// ✅ Venue BPM popup alert above nav bar
// ✅ Edge-of-screen pulse for BPM alerts
// ✅ Local notification setting toggle for BPM alerts
// ✅ Skia PulseRings — triggers for 5s on every pulse (manual + auto)

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PagerView from "react-native-pager-view";
import MapView, { Marker, Circle } from "react-native-maps";
import { supabase } from "./lib/supabase";
import PulseRings from "./PulseRings";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const AUTO_PULSE_EVERY_MS     = 90_000;
const PULSE_TTL_MINUTES       = 30;
const MANUAL_COOLDOWN_SECONDS = 60;
const VENUE_RADIUS_METERS     = 1500;
const VENUE_MAX               = 80;
const BPM_WINDOW_MINUTES      = 10;
const MS_PER_MIN              = 60_000;
const MAP_MAX_PULSE_POINTS    = 320;
const MAP_MAX_VENUE_POINTS    = 120;
const NAV_HEIGHT              = 74;
const BPM_ALERT_THRESHOLD     = 50;
const BPM_ALERT_SHOW_MS       = 5000;
const SKIA_ANIMATION_MS       = 5000;

const AGE_BRACKETS = ["18-21", "22-24", "25-30", "35-40", "50+"];

const PRESET_AVATARS = [
  { id: "a1",  emoji: "🦊" },
  { id: "a2",  emoji: "🐺" },
  { id: "a3",  emoji: "🐸" },
  { id: "a4",  emoji: "🐼" },
  { id: "a5",  emoji: "🦁" },
  { id: "a6",  emoji: "🐯" },
  { id: "a7",  emoji: "🐨" },
  { id: "a8",  emoji: "🦋" },
  { id: "a9",  emoji: "🐙" },
  { id: "a10", emoji: "🦄" },
  { id: "a11", emoji: "🐲" },
  { id: "a12", emoji: "👾" },
];

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const ttlExpiresAtISO = () =>
  new Date(Date.now() + PULSE_TTL_MINUTES * 60 * 1000).toISOString();

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

const DARK_MAP_STYLE = [
  { elementType: "geometry",           stylers: [{ color: "#0f0f10" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#8a8a8a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f0f10" }] },
  { featureType: "road",  elementType: "geometry", stylers: [{ color: "#151516" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#060b12" }] },
];

// ─────────────────────────────────────────────────────────────────────────────
// PulsingDot — small animated dot used on venue marker
// ─────────────────────────────────────────────────────────────────────────────
function PulsingDot({ size = 14 }) {
  const scale   = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.35, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 0.9,  duration: 1100, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.35, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9,  duration: 1100, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: "#00e5ff",
        transform: [{ scale }], opacity,
        borderWidth: 1, borderColor: "rgba(255,255,255,0.35)",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PulseRipple — existing RN Animated ripple overlay (kept as-is)
// ─────────────────────────────────────────────────────────────────────────────
function PulseRipple({ visible, size = 260, duration = 1600, colors, coreColor = "#A855F7", onFinish }) {
  const _colors = colors || [
    "rgba(124,58,237,0.30)",
    "rgba(168,85,247,0.26)",
    "rgba(236,72,153,0.22)",
    "rgba(34,211,238,0.20)",
  ];
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const r3 = useRef(new Animated.Value(0)).current;
  const r4 = useRef(new Animated.Value(0)).current;
  const vals = [r1, r2, r3, r4];

  useEffect(() => {
    if (!visible) { vals.forEach((v) => v.setValue(0)); return; }
    const run = (val, delay = 0) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(val, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]);
    Animated.parallel([run(r1, 0), run(r2, 140), run(r3, 280), run(r4, 420)]).start(() => {
      vals.forEach((v) => v.setValue(0));
      if (onFinish) onFinish();
    });
  }, [visible]);

  const ringStyle = (val) => ({
    opacity: val.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 0.95, 0.25, 0] }),
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1.8] }) }],
  });

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.rippleOverlay}>
      <View style={styles.rippleWrapper}>
        {vals.map((val, i) => (
          <Animated.View
            key={i}
            style={[
              styles.rippleFill,
              { width: size, height: size, borderRadius: size / 2, backgroundColor: _colors[i] },
              ringStyle(val),
            ]}
          />
        ))}
        <View style={[styles.rippleCore, { backgroundColor: coreColor }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MapRippleCircles — georeferenced ripple inside MapView
// ─────────────────────────────────────────────────────────────────────────────
const MAP_RIPPLE_RINGS      = 3;
const MAP_RIPPLE_DURATION   = 1800;
const MAP_RIPPLE_MAX_RADIUS = 300;
const MAP_RIPPLE_STAGGER    = 380;
const MAP_RIPPLE_TOTAL      = MAP_RIPPLE_DURATION + MAP_RIPPLE_STAGGER * (MAP_RIPPLE_RINGS - 1);

function MapRippleCircles({ latitude, longitude, pulseKey }) {
  const [rings, setRings] = useState(
    Array.from({ length: MAP_RIPPLE_RINGS }, () => ({ radius: 0, opacity: 0 }))
  );
  const timerRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (!latitude || !longitude || !pulseKey) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setRings(Array.from({ length: MAP_RIPPLE_RINGS }, () => ({ radius: 0, opacity: 0 })));
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const next = Array.from({ length: MAP_RIPPLE_RINGS }, (_, i) => {
        const re = elapsed - i * MAP_RIPPLE_STAGGER;
        if (re <= 0) return { radius: 0, opacity: 0 };
        const t      = Math.min(re / MAP_RIPPLE_DURATION, 1);
        const radius  = MAP_RIPPLE_MAX_RADIUS * (1 - Math.pow(1 - t, 2));
        const opacity = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
        return { radius, opacity: Math.max(0, opacity) };
      });
      setRings(next);
      if (elapsed >= MAP_RIPPLE_TOTAL + 50) {
        clearInterval(timerRef.current);
        setRings(Array.from({ length: MAP_RIPPLE_RINGS }, () => ({ radius: 0, opacity: 0 })));
      }
    }, 33);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [pulseKey]);

  if (!latitude || !longitude) return null;

  const center  = { latitude, longitude };
  const fills   = [
    (o) => `rgba(168,85,247,${(o * 0.28).toFixed(3)})`,
    (o) => `rgba(236,72,153,${(o * 0.24).toFixed(3)})`,
    (o) => `rgba(34,211,238,${(o * 0.22).toFixed(3)})`,
  ];
  const strokes = [
    (o) => `rgba(168,85,247,${(o * 0.90).toFixed(3)})`,
    (o) => `rgba(236,72,153,${(o * 0.85).toFixed(3)})`,
    (o) => `rgba(34,211,238,${(o * 0.80).toFixed(3)})`,
  ];

  return (
    <>
      {rings.map((ring, i) => {
        if (ring.radius < 2 || ring.opacity < 0.01) return null;
        return (
          <Circle
            key={i}
            center={center}
            radius={ring.radius}
            fillColor={fills[i](ring.opacity)}
            strokeColor={strokes[i](ring.opacity)}
            strokeWidth={2.5}
          />
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EdgePulseOverlay — flashing screen border for BPM alerts
// ─────────────────────────────────────────────────────────────────────────────
function EdgePulseOverlay({ visible, onFinish }) {
  const edge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { edge.setValue(0); return; }
    const seq = Animated.loop(
      Animated.sequence([
        Animated.timing(edge, { toValue: 1,    duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(edge, { toValue: 0.15, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    seq.start();
    const t = setTimeout(() => { seq.stop(); edge.setValue(0); if (onFinish) onFinish(); }, BPM_ALERT_SHOW_MS);
    return () => { clearTimeout(t); seq.stop(); edge.setValue(0); };
  }, [visible]);

  return (
    <View pointerEvents="none" style={styles.edgePulseContainer}>
      <Animated.View style={[styles.edgeTop,    { opacity: edge.interpolate({ inputRange: [0,1], outputRange: [0, 0.95] }) }]} />
      <Animated.View style={[styles.edgeLeft,   { opacity: edge.interpolate({ inputRange: [0,1], outputRange: [0, 0.80] }) }]} />
      <Animated.View style={[styles.edgeRight,  { opacity: edge.interpolate({ inputRange: [0,1], outputRange: [0, 0.80] }) }]} />
      <Animated.View style={[styles.edgeBottom, { opacity: edge.interpolate({ inputRange: [0,1], outputRange: [0, 0.90] }) }]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BpmAlertBanner
// ─────────────────────────────────────────────────────────────────────────────
function BpmAlertBanner({ message, visible }) {
  if (!visible || !message) return null;
  return (
    <View pointerEvents="none" style={styles.alertBannerWrap}>
      <View style={styles.alertBanner}>
        <Text style={styles.alertBannerText} numberOfLines={2}>{message}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthScreen
// ─────────────────────────────────────────────────────────────────────────────
const AuthScreen = () => {
  const [mode,     setMode]     = useState("login");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");

  const handleSubmit = async () => {
    setError(""); setSuccess("");
    if (!email || !password)                  { setError("Please fill in all fields."); return; }
    if (mode === "signup" && !username)        { setError("Please enter a username."); return; }
    if (password.length < 6)                  { setError("Password must be at least 6 characters."); return; }
    setLoading(true);

    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id, username, avatar_id: "a1", favourite_venues: [], age_bracket: null,
        });
      }
      setSuccess("Account created! Check your email to confirm, then log in.");
      setMode("login");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
    }
    setLoading(false);
  };

  return (
    <View style={styles.authContainer}>
      <Text style={styles.authTitle}>Pulse</Text>
      <Text style={styles.authSub}>{mode === "login" ? "Welcome back" : "Create your account"}</Text>
      {mode === "signup" && (
        <TextInput style={styles.authInput} placeholder="Username" placeholderTextColor="#666"
          value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={24} />
      )}
      <TextInput style={styles.authInput} placeholder="Email" placeholderTextColor="#666"
        value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.authInput} placeholder="Password" placeholderTextColor="#666"
        value={password} onChangeText={setPassword} secureTextEntry />
      {!!error   && <Text style={styles.authError}>{error}</Text>}
      {!!success && <Text style={styles.authSuccess}>{success}</Text>}
      <Pressable style={[styles.authBtn, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.authBtnText}>{mode === "login" ? "Log In" : "Sign Up"}</Text>}
      </Pressable>
      <Pressable onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setSuccess(""); }}>
        <Text style={styles.authToggle}>
          {mode === "login" ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
        </Text>
      </Pressable>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LeaderboardScreen
// ─────────────────────────────────────────────────────────────────────────────
const LeaderboardScreen = ({ leaderboard }) => (
  <View style={{ flex: 1, paddingTop: 56 }}>
    <View style={styles.leaderHeader}>
      <Text style={styles.leaderTitle}>Top Venues Right Now</Text>
      <Text style={styles.leaderSub}>BPM = pulses/min over last {BPM_WINDOW_MINUTES} mins</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 18 }}>
      {leaderboard.length === 0 ? (
        <Text style={{ color: "#bbb", textAlign: "center", marginTop: 18 }}>
          No venue pulses yet — go to the map, select a venue and hit PULSE HERE.
        </Text>
      ) : (
        leaderboard.map((row, idx) => (
          <View key={row.venueId} style={styles.leaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Text style={styles.rank}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.venueName} numberOfLines={1}>{row.name}</Text>
                <Text style={styles.venueMeta} numberOfLines={1}>
                  Going now: {row.goingNow}{"  •  "}Pulses: {row.pulsesInWindow}{"  •  "}Users: {row.uniqueUsersWindow}
                  {row.distanceM != null ? `  •  ${(row.distanceM / 1000).toFixed(2)} km` : ""}
                </Text>
              </View>
            </View>
            <View style={styles.bpmPill}>
              <Text style={styles.bpmValue}>{row.bpm.toFixed(1)}</Text>
              <Text style={styles.bpmLabel}>BPM</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// FriendsScreen
// ─────────────────────────────────────────────────────────────────────────────
const FriendsScreen = ({ myUsername, outgoing, incoming, friends, onSendRequest, onRespondRequest, refreshing, onRefresh }) => {
  const [query, setQuery] = useState("");
  const [msg,   setMsg]   = useState("");

  const send = async () => {
    setMsg("");
    try {
      const u = query.trim();
      if (!u)          return setMsg("Enter a username.");
      if (!myUsername) return setMsg("Set your username in Account first.");
      await onSendRequest(u);
      setQuery("");
      setMsg("Request sent ✅");
    } catch (e) { setMsg(String(e?.message || e)); }
  };

  return (
    <View style={{ flex: 1, paddingTop: 56 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 18 }}>
        <Text style={styles.sectionTitle}>Add Friends</Text>
        <View style={styles.profileCard}>
          <Text style={{ color: "#bbb", textAlign: "center" }}>
            Add by username (e.g. <Text style={{ color: "#fff", fontWeight: "900" }}>ciaran</Text>)
          </Text>
          <View style={{ width: "100%", gap: 10, marginTop: 12 }}>
            <TextInput style={styles.authInput} placeholder="Search username" placeholderTextColor="#666"
              value={query} onChangeText={setQuery} autoCapitalize="none" maxLength={24} />
            <Pressable style={styles.authBtn} onPress={send}>
              <Text style={styles.authBtnText}>Send Friend Request</Text>
            </Pressable>
            {!!msg && <Text style={{ color: "#bbb", textAlign: "center" }}>{msg}</Text>}
            <Pressable style={[styles.smallBtn, { backgroundColor: "#222", marginTop: 6 }]} onPress={onRefresh} disabled={refreshing}>
              <Text style={[styles.smallBtnText, { color: "#fff" }]}>{refreshing ? "Refreshing…" : "Refresh"}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Incoming Requests</Text>
        {incoming.length === 0 ? <Text style={styles.emptyText}>No incoming requests.</Text> :
          incoming.map((r) => (
            <View key={r.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>👤</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyText}>{r.fromUsername || "Unknown"}</Text>
                <Text style={styles.historyTime}>{new Date(r.created_at).toLocaleString()}</Text>
              </View>
              <Pressable style={[styles.smallBtn, { marginRight: 8 }]} onPress={() => onRespondRequest(r.id, true)}>
                <Text style={styles.smallBtnText}>Accept</Text>
              </Pressable>
              <Pressable style={[styles.smallBtn, { backgroundColor: "#333" }]} onPress={() => onRespondRequest(r.id, false)}>
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>Decline</Text>
              </Pressable>
            </View>
          ))
        }

        <Text style={styles.sectionTitle}>Friends</Text>
        {friends.length === 0 ? <Text style={styles.emptyText}>No friends yet — add someone by username.</Text> :
          friends.map((f) => (
            <View key={f.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>🧑‍🤝‍🧑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyText}>{f.username}</Text>
                <Text style={styles.historyTime}>Friend</Text>
              </View>
            </View>
          ))
        }

        <Text style={styles.sectionTitle}>Outgoing (Pending)</Text>
        {outgoing.length === 0 ? <Text style={styles.emptyText}>No outgoing requests.</Text> :
          outgoing.map((r) => (
            <View key={r.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>📨</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyText}>{r.toUsername || "Unknown"}</Text>
                <Text style={styles.historyTime}>{new Date(r.created_at).toLocaleString()}</Text>
              </View>
              <Text style={{ color: "#aaa", fontWeight: "800" }}>Pending</Text>
            </View>
          ))
        }
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AccountScreen
// ─────────────────────────────────────────────────────────────────────────────
const AccountScreen = ({ session, profile, pulseHistory, onLogout, onSaveProfile, onDeleteFavourite, bpmAlertsEnabled, onToggleBpmAlerts }) => {
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername,     setNewUsername]     = useState(profile?.username || "");
  const [avatarPicker,    setAvatarPicker]    = useState(false);
  const [saving,          setSaving]          = useState(false);

  const currentAvatar = PRESET_AVATARS.find((a) => a.id === profile?.avatar_id) || PRESET_AVATARS[0];

  const handleSaveUsername = async () => {
    setSaving(true);
    await onSaveProfile({ username: newUsername, avatar_id: profile?.avatar_id, favourite_venues: profile?.favourite_venues || [], age_bracket: profile?.age_bracket ?? null });
    setSaving(false);
    setEditingUsername(false);
  };

  const handlePickAvatar = async (id) => {
    setAvatarPicker(false);
    await onSaveProfile({ username: profile?.username, avatar_id: id, favourite_venues: profile?.favourite_venues || [], age_bracket: profile?.age_bracket ?? null });
  };

  return (
    <View style={{ flex: 1, paddingTop: 56 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 18 }}>
        <View style={styles.profileCard}>
          <Pressable style={styles.avatarCircle} onPress={() => setAvatarPicker(true)}>
            <Text style={styles.avatarEmoji}>{currentAvatar.emoji}</Text>
            <View style={styles.avatarEditBadge}><Text style={{ fontSize: 10, color: "#fff" }}>✏️</Text></View>
          </Pressable>
          {editingUsername ? (
            <View style={styles.usernameRow}>
              <TextInput style={styles.usernameInput} value={newUsername} onChangeText={setNewUsername}
                autoFocus maxLength={24} placeholder="Enter username" placeholderTextColor="#666" autoCapitalize="none" />
              <Pressable style={[styles.smallBtn, saving && styles.buttonDisabled]} onPress={handleSaveUsername} disabled={saving}>
                <Text style={styles.smallBtnText}>{saving ? "…" : "Save"}</Text>
              </Pressable>
              <Pressable style={[styles.smallBtn, { backgroundColor: "#333" }]} onPress={() => setEditingUsername(false)}>
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => { setNewUsername(profile?.username || ""); setEditingUsername(true); }}>
              <Text style={styles.profileUsername}>
                {profile?.username || "Set a username"} <Text style={{ fontSize: 13, color: "#aaa" }}>✏️</Text>
              </Text>
            </Pressable>
          )}
          <Text style={styles.profileEmail}>{session?.user?.email}</Text>
          {!!profile?.age_bracket && (
            <Text style={{ color: "#8bdcff", marginTop: 6, fontWeight: "700" }}>Age bracket: {profile.age_bracket}</Text>
          )}
        </View>

        <Modal visible={avatarPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Pick Your Avatar</Text>
              <View style={styles.avatarGrid}>
                {PRESET_AVATARS.map((a) => (
                  <Pressable key={a.id}
                    style={[styles.avatarOption, profile?.avatar_id === a.id && styles.avatarOptionSelected]}
                    onPress={() => handlePickAvatar(a.id)}>
                    <Text style={{ fontSize: 28 }}>{a.emoji}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={[styles.smallBtn, { marginTop: 14 }]} onPress={() => setAvatarPicker(false)}>
                <Text style={styles.smallBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Text style={styles.sectionTitle}>Alert Settings</Text>
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyText}>Venue BPM alerts</Text>
            <Text style={styles.historyTime}>Show popup + edge pulse when a venue reaches {BPM_ALERT_THRESHOLD} BPM</Text>
          </View>
          <Pressable style={[styles.settingToggle, bpmAlertsEnabled ? styles.settingToggleOn : styles.settingToggleOff]} onPress={onToggleBpmAlerts}>
            <Text style={styles.settingToggleText}>{bpmAlertsEnabled ? "ON" : "OFF"}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Recent Pulses</Text>
        {pulseHistory.length === 0 ? <Text style={styles.emptyText}>No pulses yet.</Text> :
          pulseHistory.slice(0, 20).map((p) => (
            <View key={p.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>{p.venueId ? "📍" : p.source === "manual" ? "⚡" : "🔄"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyText}>{p.venueName || (p.source === "manual" ? "Manual pulse" : "Auto pulse")}</Text>
                <Text style={styles.historyTime}>{new Date(p.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          ))
        }

        <Text style={styles.sectionTitle}>Favourite Venues</Text>
        {!profile?.favourite_venues || profile.favourite_venues.length === 0 ? (
          <Text style={styles.emptyText}>No favourites yet — pulse a venue to add it automatically.</Text>
        ) : (
          profile.favourite_venues.map((fav) => (
            <View key={fav.venueId} style={styles.historyRow}>
              <Text style={styles.historyIcon}>⭐</Text>
              <Text style={[styles.historyText, { flex: 1 }]}>{fav.name}</Text>
              <Pressable onPress={() => onDeleteFavourite(fav.venueId)}>
                <Text style={{ color: "#ff4466", fontSize: 18, paddingHorizontal: 8 }}>✕</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AnimatedVenueMarker — bobs + rotates for pub/bar emojis
// ─────────────────────────────────────────────────────────────────────────────
const ANIMATED_EMOJIS = new Set(["🍺", "🍸"]);

function AnimatedVenueMarker({ emoji, isSelected }) {
  const bob    = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ANIMATED_EMOJIS.has(emoji)) return;

    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob,    { toValue: -6, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(bob,    { toValue:  0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    const rotateLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, { toValue:  1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(rotate, { toValue: -1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(rotate, { toValue:  0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );

    bobLoop.start();
    rotateLoop.start();
    return () => { bobLoop.stop(); rotateLoop.stop(); };
  }, [emoji]);

  const rotateStr = rotate.interpolate({ inputRange: [-1, 1], outputRange: ["-12deg", "12deg"] });

  return (
    <Animated.View style={{
      backgroundColor: isSelected ? "rgba(0,229,255,0.18)" : "rgba(0,0,0,0.85)",
      borderWidth: 1,
      borderColor: isSelected ? "rgba(0,229,255,0.75)" : "rgba(255,255,255,0.22)",
      paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999,
      transform: [
        { translateY: ANIMATED_EMOJIS.has(emoji) ? bob : 0 },
        { rotate: ANIMATED_EMOJIS.has(emoji) ? rotateStr : "0deg" },
      ],
    }}>
      <Text style={{ color: "white", fontSize: 14 }}>{emoji}</Text>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MapPane
// ─────────────────────────────────────────────────────────────────────────────
function MapPane({ title, subtitle, location, venues, pulses, selectedVenue, setSelectedVenue, showPulseAnim, mapRef, mapRippleKey, rippleLocation }) {
  if (Platform.OS === "web") {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", justifyContent: "center" }]}>
        <Text style={{ color: "#bbb", textAlign: "center", paddingHorizontal: 20 }}>
          Map view is running in Expo Go mode.
        </Text>
      </View>
    );
  }

  const region = {
    latitude:       location?.latitude  ?? 53.3498,
    longitude:      location?.longitude ?? -6.2603,
    latitudeDelta:  0.03,
    longitudeDelta: 0.03,
  };

  const now          = Date.now();
  const activePulses = (pulses || []).filter((p) => new Date(p.expiresAt).getTime() > now).slice(0, MAP_MAX_PULSE_POINTS);
  const venuesToRender = (venues || []).slice(0, MAP_MAX_VENUE_POINTS);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        showsUserLocation showsMyLocationButton
        onPress={() => setSelectedVenue(null)}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        customMapStyle={Platform.OS === "android" ? DARK_MAP_STYLE : undefined}
      >
        {activePulses.map((p) => {
          const lat = Number(p.latitude), lon = Number(p.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const isVenue  = !!p.venueId;
          const isManual = p.source === "manual";
          const core     = isVenue ? "rgba(255,209,102,0.26)" : isManual ? "rgba(255,255,255,0.16)" : "rgba(0,229,255,0.20)";
          const glow     = isVenue ? "rgba(255,209,102,0.12)" : isManual ? "rgba(255,255,255,0.08)" : "rgba(0,229,255,0.10)";
          const baseR    = isVenue ? 70 : 50;
          return (
            <React.Fragment key={`pulse-${p.id}`}>
              <Circle center={{ latitude: lat, longitude: lon }} radius={baseR * 1.7} strokeWidth={0} fillColor={glow} />
              <Circle center={{ latitude: lat, longitude: lon }} radius={baseR}       strokeWidth={0} fillColor={core} />
            </React.Fragment>
          );
        })}

        <MapRippleCircles latitude={rippleLocation?.latitude} longitude={rippleLocation?.longitude} pulseKey={mapRippleKey} />

        {venuesToRender.map((v) => {
          const lat = Number(v.latitude), lon = Number(v.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          const isSelected = selectedVenue?.id === v.id;
          return (
            <Marker key={v.id} coordinate={{ latitude: lat, longitude: lon }}
              title={v.name} description={String(v.kind || "venue")}
              tracksViewChanges={ANIMATED_EMOJIS.has(kindEmoji(v.kind))}
              onPress={(e) => { e.stopPropagation?.(); setSelectedVenue(v); }}>
              <AnimatedVenueMarker emoji={kindEmoji(v.kind)} isSelected={isSelected} />
            </Marker>
          );
        })}

        {showPulseAnim && selectedVenue?.latitude && selectedVenue?.longitude && (
          <Marker
            coordinate={{ latitude: Number(selectedVenue.latitude), longitude: Number(selectedVenue.longitude) }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <PulsingDot size={16} />
          </Marker>
        )}
      </MapView>

      <View style={styles.mapModePill}>
        <Text style={styles.mapModeTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.mapModeSub}>{subtitle}</Text>}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("map");

  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [profile,      setProfile]      = useState(null);
  const [pulseHistory, setPulseHistory] = useState([]);

  const [status,   setStatus]   = useState("Booting…");
  const [location, setLocation] = useState(null);

  const [pulses, setPulses] = useState([]);
  const [venues, setVenues] = useState([]);
  const venuesRef = useRef([]);

  const [selectedVenue, setSelectedVenue] = useState(null);
  const [cooldownLeft,  setCooldownLeft]  = useState(0);

  const timerRef = useRef(null);

  const [friendIds,          setFriendIds]          = useState([]);
  const [friendsRefreshing,  setFriendsRefreshing]  = useState(false);
  const [incomingReq,        setIncomingReq]        = useState([]);
  const [outgoingReq,        setOutgoingReq]        = useState([]);
  const [friendsList,        setFriendsList]        = useState([]);

  const pagerRef = useRef(null);
  const [mapPage, setMapPage] = useState(0);

  const mapRefAll     = useRef(null);
  const mapRefAge     = useRef(null);
  const mapRefFriends = useRef(null);

  const [showAgeModal, setShowAgeModal] = useState(false);

  const [showDailyPrompt,  setShowDailyPrompt]  = useState(false);
  const [dailySubmitting,  setDailySubmitting]  = useState(false);
  const [dailyChoice,      setDailyChoice]      = useState(null);
  const [showDailyResults, setShowDailyResults] = useState(false);
  const [dailyStats,       setDailyStats]       = useState({ total: 0, yes: 0, maybe: 0, no: 0 });

  // ── Ripple (existing RN animated) ─────────────────────────────────────────
  const [showPulseRipple, setShowPulseRipple] = useState(false);
  const [mapRippleKey,    setMapRippleKey]    = useState(0);
  const [rippleLocation,  setRippleLocation]  = useState(null);
  const [pulseScreenPos,  setPulseScreenPos]  = useState(null);

  // ── Skia PulseRings ───────────────────────────────────────────────────────
  const pulseRingsRef      = useRef(null);
  const [showPulseRings,   setShowPulseRings] = useState(false);
  const pulseRingsTimerRef = useRef(null);

  // ── BPM alerts ────────────────────────────────────────────────────────────
  const [bpmAlertsEnabled, setBpmAlertsEnabled] = useState(true);
  const [alertMessage,     setAlertMessage]     = useState("");
  const [showAlertBanner,  setShowAlertBanner]  = useState(false);
  const [showEdgePulse,    setShowEdgePulse]    = useState(false);
  const alertTimerRef     = useRef(null);
  const alertedVenuesRef  = useRef(new Map());

  useEffect(() => { venuesRef.current = venues; }, [venues]);

  const getOneLocationFix = async () => {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  };

  // ── triggerPulseAnimation — Skia rings for 5 seconds ─────────────────────
  const triggerPulseAnimation = useCallback(() => {
    if (pulseRingsTimerRef.current) {
      clearTimeout(pulseRingsTimerRef.current);
      pulseRingsTimerRef.current = null;
    }
    // If already showing, restart via ref to avoid flicker
    if (showPulseRings && pulseRingsRef.current) {
      pulseRingsRef.current.trigger();
    } else {
      setShowPulseRings(true);
    }
    pulseRingsTimerRef.current = setTimeout(() => {
      setShowPulseRings(false);
      pulseRingsTimerRef.current = null;
    }, SKIA_ANIMATION_MS);
  }, [showPulseRings]);

  useEffect(() => {
    return () => { if (pulseRingsTimerRef.current) clearTimeout(pulseRingsTimerRef.current); };
  }, []);

  // ── triggerPulseRipple — existing RN ripple + map circles ─────────────────
  const triggerPulseRipple = (loc) => {
    setShowPulseRipple(false);
    requestAnimationFrame(() => setShowPulseRipple(true));
    if (loc?.latitude && loc?.longitude) {
      setRippleLocation({ latitude: loc.latitude, longitude: loc.longitude });
      setMapRippleKey((k) => k + 1);
    }
  };

  const triggerBpmAlert = (venueName) => {
    setAlertMessage(`${venueName} just reached ${BPM_ALERT_THRESHOLD} bpm`);
    setShowAlertBanner(true);
    setShowEdgePulse(true);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => {
      setShowAlertBanner(false);
      setAlertMessage("");
      setShowEdgePulse(false);
    }, BPM_ALERT_SHOW_MS);
  };

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const raw = await AsyncStorage.getItem("pulse_bpm_alerts_enabled");
        setBpmAlertsEnabled(raw == null ? true : raw === "true");
      } catch { setBpmAlertsEnabled(true); }
    };
    loadSetting();
    return () => { if (alertTimerRef.current) clearTimeout(alertTimerRef.current); };
  }, []);

  const toggleBpmAlerts = async () => {
    const next = !bpmAlertsEnabled;
    setBpmAlertsEnabled(next);
    try { await AsyncStorage.setItem("pulse_bpm_alerts_enabled", String(next)); } catch {}
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    supabase.from("profiles").select("*").eq("id", session.user.id).single().then(({ data }) => {
      setProfile(data || { id: session.user.id, username: "", avatar_id: "a1", favourite_venues: [], age_bracket: null });
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || !profile) return;
    setShowAgeModal(!profile.age_bracket);
  }, [session?.user?.id, profile?.age_bracket]);

  const onSaveProfile = async (updates) => {
    if (!session?.user) return;
    const { data, error } = await supabase.from("profiles").upsert({ id: session.user.id, ...updates }).select().single();
    if (error) { setStatus(`Profile save error: ${error.message}`); return; }
    if (data) setProfile(data);
  };

  const onDeleteFavourite = async (venueId) => {
    if (!profile) return;
    const updated = (profile.favourite_venues || []).filter((f) => f.venueId !== venueId);
    await onSaveProfile({ username: profile.username, avatar_id: profile.avatar_id, favourite_venues: updated, age_bracket: profile.age_bracket ?? null });
  };

  const addFavouriteVenue = async (venue) => {
    if (!profile || !venue) return;
    const existing = profile.favourite_venues || [];
    if (existing.some((f) => f.venueId === venue.id)) return;
    await onSaveProfile({ username: profile.username, avatar_id: profile.avatar_id, favourite_venues: [...existing, { venueId: venue.id, name: venue.name }], age_bracket: profile.age_bracket ?? null });
  };

  const onLogout = async () => { await supabase.auth.signOut(); setTab("map"); setSelectedVenue(null); };

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  const addPulseToDb = async ({ lat, lon, source, venueId }) => {
    const payload = {
      latitude: lat, longitude: lon,
      expires_at: ttlExpiresAtISO(),
      source,
      venue_id:     venueId ?? null,
      user_id:      session?.user?.id ?? null,
      minute_bucket: venueId ? new Date().toISOString().slice(0, 16) : null,
      age_bracket:  profile?.age_bracket ?? null,
    };
    const { error } = await supabase.from("pulses").insert([payload]);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) { setStatus("Too fast — wait a moment."); return; }
      setStatus(`Insert error: ${error.message}`);
    }
  };

  const loadPulses = async () => {
    const { data, error } = await supabase
      .from("pulses")
      .select("id, latitude, longitude, created_at, expires_at, source, venue_id, user_id, age_bracket")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1200);
    if (error) { setStatus(`Load error: ${error.message}`); return; }
    setPulses((data || []).map((p) => ({
      id: p.id, latitude: p.latitude, longitude: p.longitude,
      createdAt: p.created_at, expiresAt: p.expires_at,
      source: p.source, venueId: p.venue_id, userId: p.user_id, ageBracket: p.age_bracket ?? null,
    })));
  };

  useEffect(() => {
    loadPulses();
    const ch = supabase.channel("pulses-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pulses" }, (payload) => {
        const p = payload.new;
        if (new Date(p.expires_at).getTime() <= Date.now()) return;
        setPulses((prev) => [{
          id: p.id, latitude: p.latitude, longitude: p.longitude,
          createdAt: p.created_at, expiresAt: p.expires_at,
          source: p.source, venueId: p.venue_id, userId: p.user_id, ageBracket: p.age_bracket ?? null,
        }, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── Location + auto-pulse ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        setStatus("Requesting location permission…");
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm !== "granted") { setStatus("Location permission denied"); return; }

        setStatus("Getting location…");
        const fix = await getOneLocationFix();
        if (!mounted) return;
        setLocation(fix);
        setStatus("Live ✅");

        // Initial auto pulse — trigger Skia animation
        triggerPulseAnimation();
        await addPulseToDb({ lat: fix.latitude, lon: fix.longitude, source: "auto", venueId: null });

        timerRef.current = setInterval(async () => {
          try {
            const f = await getOneLocationFix();
            setLocation(f);
            // Auto pulse — trigger Skia animation each time
            triggerPulseAnimation();
            await addPulseToDb({ lat: f.latitude, lon: f.longitude, source: "auto", venueId: null });
          } catch {}
        }, AUTO_PULSE_EVERY_MS);
      } catch (e) { setStatus(`Error: ${String(e?.message || e)}`); }
    };

    if (session?.user) start();
    return () => { mounted = false; if (timerRef.current) clearInterval(timerRef.current); };
  }, [session?.user?.id, profile?.age_bracket]);

  useEffect(() => {
    if (!location) return;
    const region = { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 };
    [mapRefAll.current, mapRefAge.current, mapRefFriends.current].filter(Boolean).forEach((r) => {
      try { r.animateToRegion(region, 650); } catch {}
    });
  }, [location?.latitude, location?.longitude]);

  const fetchVenuesOverpass = async (lat, lon) => {
    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.nchc.org.tw/api/interpreter",
    ];
    const query = `
[out:json][timeout:25];
(
  node(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"];
  way(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"];
  relation(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"];
);
out tags center;
    `.trim();
    let lastErr = null;
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: query, signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const json = await res.json();
        const seen = new Set(), deduped = [];
        for (const e of json.elements || []) {
          const name = e.tags?.name || e.tags?.["name:en"] || null;
          const type = e.tags?.amenity || null;
          const vLat = Number(e.lat ?? e.center?.lat), vLon = Number(e.lon ?? e.center?.lon);
          if (!Number.isFinite(vLat) || !Number.isFinite(vLon)) continue;
          const key = `${vLat.toFixed(5)}-${vLon.toFixed(5)}-${type || ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({ id: `${e.type}-${e.id}`, name: name || (type ? type.toUpperCase() : "VENUE"), kind: type || "venue", latitude: vLat, longitude: vLon });
        }
        return deduped.slice(0, VENUE_MAX);
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error("Overpass failed");
  };

  useEffect(() => {
    if (!location) return;
    let alive = true, tries = 0;
    const run = async () => {
      tries++;
      try {
        setStatus((p) => `${p.split("| Venues:")[0].trim()} | Venues: loading…`);
        const v = await fetchVenuesOverpass(location.latitude, location.longitude);
        if (!alive) return;
        setVenues(v);
        setStatus((p) => `${p.split("| Venues:")[0].trim()} | Venues: ${v.length}`);
      } catch {
        if (!alive) return;
        setStatus((p) => `${p.split("| Venues:")[0].trim()} | Venues: error`);
        if (tries < 2) setTimeout(() => alive && run(), 1500);
      }
    };
    const t = setTimeout(run, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    if (!session?.user || !profile?.username || !profile?.age_bracket) return;
    const maybeShow = async () => {
      try {
        const key  = `pulse_daily_prompt_seen_${session.user.id}`;
        const seen = await AsyncStorage.getItem(key);
        if (seen !== todayISODate()) setShowDailyPrompt(true);
      } catch { setShowDailyPrompt(true); }
    };
    maybeShow();
  }, [session?.user?.id, profile?.username, profile?.age_bracket]);

  const computeDailyStats = async () => {
    const { data, error } = await supabase.from("daily_outing").select("choice").eq("day", todayISODate());
    if (error) throw error;
    const counts = { yes: 0, maybe: 0, no: 0 };
    (data || []).forEach((r) => { const c = String(r.choice || "").toLowerCase(); counts[c] = (counts[c] || 0) + 1; });
    return { total: counts.yes + counts.maybe + counts.no, ...counts };
  };

  const submitDailyChoice = async (choice) => {
    if (!session?.user) return;
    setDailySubmitting(true); setDailyChoice(choice);
    try {
      await supabase.from("daily_outing").upsert({ user_id: session.user.id, day: todayISODate(), choice }, { onConflict: "user_id,day" });
      await AsyncStorage.setItem(`pulse_daily_prompt_seen_${session.user.id}`, todayISODate());
      setShowDailyPrompt(false);
      const stats = await computeDailyStats();
      setDailyStats(stats); setShowDailyResults(true);
    } catch (e) { console.log("DAILY VOTE ERROR:", String(e?.message || e)); setShowDailyPrompt(false); }
    finally { setDailySubmitting(false); }
  };

  const loadFriendsData = async () => {
    if (!session?.user?.id) return;
    setFriendsRefreshing(true);
    const me = session.user.id;
    try {
      const { data: fr, error } = await supabase.from("friend_requests")
        .select("id, from_user, to_user, status, created_at")
        .or(`from_user.eq.${me},to_user.eq.${me}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows     = fr || [];
      const incoming = rows.filter((r) => r.to_user === me && r.status === "pending");
      const outgoing = rows.filter((r) => r.from_user === me && r.status === "pending");
      const accepted = rows.filter((r) => r.status === "accepted");
      const friendIdSet = new Set();
      accepted.forEach((r) => { const other = r.from_user === me ? r.to_user : r.from_user; if (other && other !== me) friendIdSet.add(String(other)); });
      const allIds = new Set([...incoming.map((r) => String(r.from_user)), ...outgoing.map((r) => String(r.to_user)), ...friendIdSet]);
      let profilesById = new Map();
      if (allIds.size) {
        const { data: profs, error: pErr } = await supabase.from("profiles").select("id, username").in("id", Array.from(allIds));
        if (!pErr && profs) profilesById = new Map(profs.map((p) => [String(p.id), p.username]));
      }
      setIncomingReq(incoming.map((r) => ({ ...r, fromUsername: profilesById.get(String(r.from_user)) || "Unknown" })));
      setOutgoingReq(outgoing.map((r) => ({ ...r, toUsername:   profilesById.get(String(r.to_user))   || "Unknown" })));
      const friendProfiles = Array.from(friendIdSet).map((id) => ({ id, username: profilesById.get(String(id)) || "Unknown" }));
      friendProfiles.sort((a, b) => a.username.localeCompare(b.username));
      setFriendsList(friendProfiles);
      setFriendIds(Array.from(friendIdSet));
    } catch (e) {
      console.log("FRIENDS LOAD ERROR:", String(e?.message || e));
      setIncomingReq([]); setOutgoingReq([]); setFriendsList([]); setFriendIds([]);
    } finally { setFriendsRefreshing(false); }
  };

  useEffect(() => {
    if (!session?.user?.id) { setFriendIds([]); setIncomingReq([]); setOutgoingReq([]); setFriendsList([]); return; }
    loadFriendsData();
  }, [session?.user?.id]);

  const sendFriendRequestByUsername = async (username) => {
    if (!session?.user?.id) throw new Error("Not logged in.");
    const me = session.user.id;
    const u  = (username || "").trim();
    if (!u) throw new Error("Enter a username.");
    const { data: target, error: findErr } = await supabase.from("profiles").select("id, username").ilike("username", u).maybeSingle();
    if (findErr) throw findErr;
    if (!target) throw new Error("User not found.");
    if (String(target.id) === String(me)) throw new Error("That's you.");
    const { error: insErr } = await supabase.from("friend_requests").insert([{ from_user: me, to_user: target.id, status: "pending" }]);
    if (insErr) { if ((insErr.message || "").toLowerCase().includes("duplicate")) throw new Error("Request already sent."); throw insErr; }
    await loadFriendsData();
  };

  const respondToFriendRequest = async (requestId, accept) => {
    const { error } = await supabase.from("friend_requests").update({ status: accept ? "accepted" : "declined" }).eq("id", requestId);
    if (error) throw error;
    await loadFriendsData();
  };

  useEffect(() => {
    if (!session?.user || tab !== "account") return;
    supabase.from("pulses").select("id, created_at, source, venue_id, latitude, longitude")
      .eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => {
        if (!data) return;
        const vm = new Map(venuesRef.current.map((v) => [v.id, v.name]));
        setPulseHistory(data.map((p) => ({
          id: p.id, createdAt: p.created_at, source: p.source, venueId: p.venue_id,
          venueName: p.venue_id ? vm.get(p.venue_id) || "Unknown venue" : null,
          latitude: p.latitude, longitude: p.longitude,
        })));
      });
  }, [session?.user?.id, tab]);

  const selectedVenuePulses = useMemo(() => {
    if (!selectedVenue) return [];
    const now = Date.now();
    return pulses.filter((p) => p.venueId === selectedVenue.id && new Date(p.expiresAt).getTime() > now);
  }, [pulses, selectedVenue]);

  const uniqueUsersAtVenue = useMemo(() => {
    const s = new Set();
    selectedVenuePulses.forEach((p) => { if (p.userId) s.add(String(p.userId)); });
    return Array.from(s);
  }, [selectedVenuePulses]);

  const distanceToSelectedVenue = useMemo(() => {
    if (!selectedVenue || !location) return null;
    return haversineMeters(location.latitude, location.longitude, selectedVenue.latitude, selectedVenue.longitude);
  }, [selectedVenue, location]);

  const selectedVenueBpm = useMemo(() => {
    if (!selectedVenue) return 0;
    const windowStart = Date.now() - BPM_WINDOW_MINUTES * MS_PER_MIN;
    return pulses.filter((p) => { if (p.venueId !== selectedVenue.id) return false; const c = new Date(p.createdAt).getTime(); return Number.isFinite(c) && c >= windowStart; }).length / BPM_WINDOW_MINUTES;
  }, [pulses, selectedVenue]);

  const leaderboard = useMemo(() => {
    const now = Date.now(), windowStart = now - BPM_WINDOW_MINUTES * MS_PER_MIN;
    const activeNow = new Map();
    pulses.forEach((p) => {
      if (!p.venueId || !p.userId || new Date(p.expiresAt).getTime() <= now) return;
      if (!activeNow.has(p.venueId)) activeNow.set(p.venueId, new Set());
      activeNow.get(p.venueId).add(String(p.userId));
    });
    const agg = new Map();
    pulses.forEach((p) => {
      if (!p.venueId) return;
      const c = new Date(p.createdAt).getTime();
      if (!Number.isFinite(c) || c < windowStart) return;
      if (!agg.has(p.venueId)) agg.set(p.venueId, { pulsesInWindow: 0, usersInWindow: new Set() });
      const a = agg.get(p.venueId);
      a.pulsesInWindow++;
      if (p.userId) a.usersInWindow.add(String(p.userId));
    });
    const venueById = new Map(venuesRef.current.map((v) => [v.id, v]));
    const rows = [];
    for (const [venueId, a] of agg.entries()) {
      const v = venueById.get(venueId); if (!v) continue;
      rows.push({
        venueId, name: v.name, kind: v.kind,
        bpm: a.pulsesInWindow / BPM_WINDOW_MINUTES,
        goingNow: activeNow.get(venueId)?.size ?? 0,
        pulsesInWindow: a.pulsesInWindow,
        uniqueUsersWindow: a.usersInWindow.size,
        distanceM: location ? haversineMeters(location.latitude, location.longitude, v.latitude, v.longitude) : null,
      });
    }
    rows.sort((x, y) => y.bpm !== x.bpm ? y.bpm - x.bpm : y.goingNow - x.goingNow);
    return rows.slice(0, 30);
  }, [pulses, venues, location]);

  useEffect(() => {
    if (!bpmAlertsEnabled || !leaderboard.length) return;
    const now = Date.now(), cooldownMs = 15 * 60 * 1000;
    leaderboard.forEach((row) => {
      if (row.bpm < BPM_ALERT_THRESHOLD) return;
      const last = alertedVenuesRef.current.get(row.venueId) || 0;
      if (now - last < cooldownMs) return;
      alertedVenuesRef.current.set(row.venueId, now);
      triggerBpmAlert(row.name);
    });
  }, [leaderboard, bpmAlertsEnabled]);

  const pulsesAll     = useMemo(() => pulses, [pulses]);
  const pulsesAge     = useMemo(() => { const b = profile?.age_bracket; if (!b) return []; return pulses.filter((p) => p.ageBracket === b); }, [pulses, profile?.age_bracket]);
  const pulsesFriends = useMemo(() => { if (!friendIds.length) return []; const s = new Set(friendIds.map(String)); return pulses.filter((p) => p.userId && s.has(String(p.userId))); }, [pulses, friendIds]);

  // ── Manual pulse ──────────────────────────────────────────────────────────
  const onPulseHere = async () => {
    try {
      if (cooldownLeft > 0) { setStatus(`Wait ${cooldownLeft}s before pulsing again.`); return; }
      const fix = location ?? (await getOneLocationFix());
      setLocation(fix);

      // Resolve user's GPS location to screen pixel position for PulseRings
      const activeMapRef = [mapRefAll, mapRefAge, mapRefFriends][mapPage] ?? mapRefAll;
      if (activeMapRef.current && fix?.latitude && fix?.longitude) {
        try {
          const pt = await activeMapRef.current.pointForCoordinate({
            latitude: fix.latitude, longitude: fix.longitude,
          });
          setPulseScreenPos({ x: pt.x, y: pt.y });
        } catch { setPulseScreenPos(null); }
      }

      triggerPulseRipple(fix);
      triggerPulseAnimation();   // ← Skia rings for 5s
      await addPulseToDb({ lat: fix.latitude, lon: fix.longitude, source: "manual", venueId: selectedVenue?.id ?? null });
      setCooldownLeft(MANUAL_COOLDOWN_SECONDS);
      if (selectedVenue) addFavouriteVenue(selectedVenue);
    } catch (e) { setStatus(`Pulse error: ${String(e?.message || e)}`); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  const userAvatar = PRESET_AVATARS.find((a) => a.id === profile?.avatar_id) || PRESET_AVATARS[0];

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, paddingBottom: NAV_HEIGHT }}>

        {tab === "map" && (
          <View style={{ flex: 1, overflow: "hidden" }}>
            <PagerView ref={pagerRef} style={{ flex: 1 }} initialPage={0} onPageSelected={(e) => setMapPage(e.nativeEvent.position)}>
              <View key="all">
                <MapPane title="Everyone" subtitle="All pulses nearby" location={location} venues={venues} pulses={pulsesAll}
                  selectedVenue={selectedVenue} setSelectedVenue={setSelectedVenue} showPulseAnim mapRef={mapRefAll}
                  mapRippleKey={mapRippleKey} rippleLocation={rippleLocation} />
              </View>
              <View key="age">
                <MapPane title="Your Age Bracket" subtitle={profile?.age_bracket || "Set age bracket"} location={location} venues={venues} pulses={pulsesAge}
                  selectedVenue={selectedVenue} setSelectedVenue={setSelectedVenue} showPulseAnim mapRef={mapRefAge}
                  mapRippleKey={mapRippleKey} rippleLocation={rippleLocation} />
              </View>
              <View key="friends">
                <MapPane title="Friends" subtitle={friendIds.length ? `${friendIds.length} friends` : "No friends added yet"} location={location} venues={venues} pulses={pulsesFriends}
                  selectedVenue={selectedVenue} setSelectedVenue={setSelectedVenue} showPulseAnim mapRef={mapRefFriends}
                  mapRippleKey={mapRippleKey} rippleLocation={rippleLocation} />
              </View>
            </PagerView>

            <View style={styles.topOverlay}>
              <Text style={styles.title}>Pulse</Text>
              <Pressable style={[styles.button, cooldownLeft > 0 && styles.buttonDisabled]} onPress={onPulseHere} disabled={cooldownLeft > 0}>
                <Text style={styles.buttonText}>{cooldownLeft > 0 ? `WAIT ${cooldownLeft}s` : selectedVenue ? "PULSE HERE" : "PULSE"}</Text>
              </Pressable>
              <Text style={styles.status}>{status}</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                <View style={styles.pageDotWrap}>
                  {[0, 1, 2].map((i) => (
                    <Text key={i} style={[styles.pageDot, mapPage === i && styles.pageDotActive]}>●</Text>
                  ))}
                </View>
              </View>
              <Text style={styles.status}>Pulses: {pulses.length} • Venues: {venues.length}</Text>
            </View>

            {/* Skia ring animation — clipped to map area, originates at user location */}
            {showPulseRings && (
              <PulseRings
                ref={pulseRingsRef}
                visible={showPulseRings}
                duration={SKIA_ANIMATION_MS}
                centerX={pulseScreenPos?.x}
                centerY={pulseScreenPos?.y}
              />
            )}

            {selectedVenue && (
              <View style={styles.sheet}>
                <View style={styles.sheetRow}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>{selectedVenue.name}</Text>
                  <Pressable onPress={() => setSelectedVenue(null)}><Text style={styles.close}>✕</Text></Pressable>
                </View>
                <View style={styles.sheetStats}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>
                      {distanceToSelectedVenue == null ? "…" : distanceToSelectedVenue < 1000 ? `${Math.round(distanceToSelectedVenue)}m` : `${(distanceToSelectedVenue / 1000).toFixed(1)}km`}
                    </Text>
                    <Text style={styles.statLabel}>Distance</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{uniqueUsersAtVenue.length}</Text>
                    <Text style={styles.statLabel}>Going Now</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{selectedVenuePulses.length}</Text>
                    <Text style={styles.statLabel}>Pulses</Text>
                  </View>
                  <View style={[styles.statBox, styles.statBoxHighlight]}>
                    <Text style={[styles.statValue, { color: "#00e5ff" }]}>{selectedVenueBpm.toFixed(1)}</Text>
                    <Text style={[styles.statLabel, { color: "#00e5ff" }]}>BPM</Text>
                  </View>
                </View>
                <Text style={styles.sheetTiny}>{selectedVenue.kind?.toUpperCase()} • 1 pulse/min global cooldown ✅</Text>
              </View>
            )}
          </View>
        )}

        {tab === "events"  && <View style={{ flex: 1, backgroundColor: "#000" }}><LeaderboardScreen leaderboard={leaderboard} /></View>}
        {tab === "friends" && <View style={{ flex: 1, backgroundColor: "#000" }}><FriendsScreen myUsername={profile?.username || ""} outgoing={outgoingReq} incoming={incomingReq} friends={friendsList} onSendRequest={sendFriendRequestByUsername} onRespondRequest={respondToFriendRequest} refreshing={friendsRefreshing} onRefresh={loadFriendsData} /></View>}
        {tab === "account" && <View style={{ flex: 1, backgroundColor: "#000" }}><AccountScreen session={session} profile={profile} pulseHistory={pulseHistory} onLogout={onLogout} onSaveProfile={onSaveProfile} onDeleteFavourite={onDeleteFavourite} bpmAlertsEnabled={bpmAlertsEnabled} onToggleBpmAlerts={toggleBpmAlerts} /></View>}
      </View>

      <BpmAlertBanner message={alertMessage} visible={showAlertBanner} />
      {showEdgePulse && <EdgePulseOverlay visible={showEdgePulse} onFinish={() => setShowEdgePulse(false)} />}

      {/* Nav bar */}
      <View style={styles.nav}>
        <Pressable style={[styles.navItem, tab === "map"     && styles.navItemActive]} onPress={() => setTab("map")}>
          <Text style={[styles.navIcon, tab === "map"     && styles.navIconActive]}>🗺️</Text>
          <Text style={[styles.navText, tab === "map"     && styles.navTextActive]}>Map</Text>
        </Pressable>
        <Pressable style={styles.navCenter} onPress={() => { setTab("map"); onPulseHere(); }}>
          <Text style={styles.navCenterText}>⚡</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "events"  && styles.navItemActive]} onPress={() => { setSelectedVenue(null); setTab("events"); }}>
          <Text style={[styles.navIcon, tab === "events"  && styles.navIconActive]}>📅</Text>
          <Text style={[styles.navText, tab === "events"  && styles.navTextActive]}>Venue Leaderboard</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "friends" && styles.navItemActive]} onPress={() => { setSelectedVenue(null); setTab("friends"); }}>
          <Text style={[styles.navIcon, tab === "friends" && styles.navIconActive]}>👥</Text>
          <Text style={[styles.navText, tab === "friends" && styles.navTextActive]}>Friends</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "account" && styles.navItemActive]} onPress={() => setTab("account")}>
          <Text style={[styles.navIcon, tab === "account" && styles.navIconActive]}>{userAvatar.emoji}</Text>
          <Text style={[styles.navText, tab === "account" && styles.navTextActive]}>{profile?.username ? profile.username.slice(0, 8) : "Account"}</Text>
        </Pressable>
      </View>

      {/*
        ROOT-LEVEL OVERLAYS — edge pulse and modals only.
        PulseRings is now rendered inside the map view (clipped to map area,
        centred on the user's screen position). PulseRipple removed — the
        geo-referenced MapRippleCircles inside MapView handles the on-map effect.
      */}

      {/* Age bracket modal */}
      <Modal visible={showAgeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Quick Q</Text>
            <Text style={{ color: "#bbb", textAlign: "center", marginBottom: 14 }}>
              Pick your age bracket (used for your age heatmap)
            </Text>
            <View style={{ width: "100%", gap: 10 }}>
              {AGE_BRACKETS.map((b) => (
                <Pressable key={b} style={[styles.choiceBtn, { backgroundColor: "rgba(255,255,255,0.08)" }]}
                  onPress={async () => {
                    await onSaveProfile({ username: profile?.username ?? "", avatar_id: profile?.avatar_id ?? "a1", favourite_venues: profile?.favourite_venues ?? [], age_bracket: b });
                    setShowAgeModal(false);
                  }}>
                  <Text style={styles.choiceBtnText}>{b}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Daily outing prompt */}
      <Modal visible={showDailyPrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {profile?.username ? `${profile.username},` : "Hey,"} are you heading out tonight?
            </Text>
            <View style={{ width: "100%", gap: 10, marginTop: 14 }}>
              {[
                { choice: "yes",   label: "Yes",   color: "#00e5ff", bg: "rgba(0,229,255,0.16)"   },
                { choice: "maybe", label: "Maybe", color: "#ffd166", bg: "rgba(255,209,102,0.14)" },
                { choice: "no",    label: "No",    color: "#ff4466", bg: "rgba(255,70,102,0.14)"  },
              ].map(({ choice, label, color, bg }) => (
                <Pressable key={choice} style={[styles.choiceBtn, { backgroundColor: bg }]}
                  onPress={() => submitDailyChoice(choice)} disabled={dailySubmitting}>
                  <Text style={[styles.choiceBtnText, { color }]}>
                    {dailySubmitting && dailyChoice === choice ? "Submitting…" : label}
                  </Text>
                </Pressable>
              ))}
              <Pressable style={[styles.smallBtn, { backgroundColor: "#222", alignSelf: "center", marginTop: 6 }]}
                onPress={() => setShowDailyPrompt(false)} disabled={dailySubmitting}>
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Daily results */}
      <Modal visible={showDailyResults} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Tonight's vibe</Text>
            <Text style={{ color: "#bbb", textAlign: "center", marginTop: 6 }}>
              Total votes today: <Text style={{ color: "#fff", fontWeight: "900" }}>{dailyStats.total}</Text>
            </Text>
            {dailyStats.total > 0 ? (
              <View style={{ width: "100%", marginTop: 16, gap: 10 }}>
                {[
                  { label: "Going out",   value: dailyStats.yes,   color: "#00e5ff" },
                  { label: "Maybe",       value: dailyStats.maybe, color: "#ffd166" },
                  { label: "Not going",   value: dailyStats.no,    color: "#ff4466" },
                ].map(({ label, value, color }) => (
                  <View key={label} style={styles.resultRow}>
                    <Text style={[styles.resultLabel, { color }]}>{label}</Text>
                    <Text style={styles.resultValue}>{value} • {Math.round((value / dailyStats.total) * 100)}%</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: "#888", textAlign: "center", marginTop: 14 }}>No votes yet today — you're the first.</Text>
            )}
            <Pressable style={[styles.smallBtn, { marginTop: 16 }]} onPress={() => setShowDailyResults(false)}>
              <Text style={styles.smallBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  topOverlay: {
    position: "absolute", top: 50, left: 16, right: 16,
    alignItems: "center", gap: 10, zIndex: 20,
  },
  title:      { color: "white", fontSize: 28, fontWeight: "700" },
  button:     { paddingVertical: 14, paddingHorizontal: 26, borderRadius: 999, backgroundColor: "white" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  status:     { color: "#ccc", fontSize: 12, textAlign: "center" },

  pageDotWrap: {
    flexDirection: "row", gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  pageDot:       { color: "rgba(255,255,255,0.35)", fontSize: 10 },
  pageDotActive: { color: "white" },

  rippleOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
    zIndex: 9999,
  },
  rippleWrapper: { width: 260, height: 260, justifyContent: "center", alignItems: "center" },
  rippleFill:    { position: "absolute" },
  rippleCore:    {
    width: 18, height: 18, borderRadius: 9,
    shadowColor: "#EC4899", shadowOpacity: 0.55, shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },

  edgePulseContainer: { ...StyleSheet.absoluteFillObject, zIndex: 40 },
  edgeTop:    { position: "absolute", top: 0, left: 0, right: 0, height: 18, backgroundColor: "rgba(168,85,247,0.95)", shadowColor: "#EC4899", shadowOpacity: 0.9, shadowRadius: 18 },
  edgeLeft:   { position: "absolute", top: 0, bottom: 0, left: 0, width: 14, backgroundColor: "rgba(236,72,153,0.90)" },
  edgeRight:  { position: "absolute", top: 0, bottom: 0, right: 0, width: 14, backgroundColor: "rgba(34,211,238,0.88)" },
  edgeBottom: { position: "absolute", left: 0, right: 0, bottom: 0, height: 18, backgroundColor: "rgba(124,58,237,0.95)" },

  alertBannerWrap: {
    position: "absolute", left: 16, right: 16, bottom: NAV_HEIGHT + 18,
    zIndex: 45, alignItems: "center",
  },
  alertBanner: {
    width: "100%", maxWidth: 420,
    backgroundColor: "rgba(15,15,18,0.96)", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(168,85,247,0.55)",
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: "#A855F7", shadowOpacity: 0.45, shadowRadius: 18, elevation: 14,
  },
  alertBannerText: { color: "#fff", textAlign: "center", fontWeight: "900", fontSize: 14 },

  sheet: {
    position: "absolute", left: 12, right: 12, bottom: 12,
    backgroundColor: "rgba(10,10,10,0.95)", borderRadius: 18,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    padding: 14, gap: 10, zIndex: 15,
    marginBottom: NAV_HEIGHT + 6,
  },
  sheetRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sheetTitle: { color: "white", fontSize: 17, fontWeight: "800", flex: 1 },
  close:      { color: "white", fontSize: 18, paddingHorizontal: 8, paddingVertical: 2 },
  sheetStats: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  statBox:    { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  statBoxHighlight: { borderColor: "rgba(0,229,255,0.3)", backgroundColor: "rgba(0,229,255,0.07)" },
  statValue:  { color: "white", fontSize: 17, fontWeight: "900" },
  statLabel:  { color: "#aaa", fontSize: 10, marginTop: 2 },
  sheetTiny:  { color: "#777", fontSize: 11 },

  leaderHeader: { paddingHorizontal: 14, paddingBottom: 10 },
  leaderTitle:  { color: "white", fontSize: 20, fontWeight: "900" },
  leaderSub:    { color: "#bbb", marginTop: 4, fontSize: 12 },
  leaderRow: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    padding: 12, marginBottom: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12,
  },
  rank:      { color: "#fff", fontWeight: "900", width: 22, textAlign: "center" },
  venueName: { color: "white", fontSize: 14, fontWeight: "800" },
  venueMeta: { color: "#bbb", fontSize: 11, marginTop: 2 },
  bpmPill:   { backgroundColor: "rgba(0,229,255,0.14)", borderColor: "rgba(0,229,255,0.25)", borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", minWidth: 74 },
  bpmValue:  { color: "white", fontWeight: "900", fontSize: 16, lineHeight: 18 },
  bpmLabel:  { color: "#cfefff", fontSize: 10, marginTop: 2 },

  profileCard: {
    alignItems: "center", padding: 24,
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", marginBottom: 24, gap: 8,
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.15)",
  },
  avatarEmoji:     { fontSize: 40 },
  avatarEditBadge: { position: "absolute", bottom: 0, right: 0, backgroundColor: "#333", borderRadius: 999, width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  usernameRow:     { flexDirection: "row", alignItems: "center", gap: 8 },
  usernameInput:   { color: "white", fontSize: 16, fontWeight: "700", borderBottomWidth: 1, borderBottomColor: "#555", paddingVertical: 4, paddingHorizontal: 8, minWidth: 120 },
  profileUsername: { color: "white", fontSize: 18, fontWeight: "800" },
  profileEmail:    { color: "#888", fontSize: 13 },

  sectionTitle: { color: "white", fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 4 },
  historyRow:   { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  historyIcon:  { fontSize: 18 },
  historyText:  { color: "white", fontSize: 13, fontWeight: "600" },
  historyTime:  { color: "#888", fontSize: 11, marginTop: 2 },
  emptyText:    { color: "#666", fontSize: 13, marginBottom: 16 },

  settingRow:       { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  settingToggle:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, minWidth: 58, alignItems: "center" },
  settingToggleOn:  { backgroundColor: "rgba(0,229,255,0.18)", borderWidth: 1, borderColor: "rgba(0,229,255,0.35)" },
  settingToggleOff: { backgroundColor: "rgba(255,255,255,0.09)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  settingToggleText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  logoutBtn:  { marginTop: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: "rgba(255,50,80,0.12)", borderWidth: 1, borderColor: "rgba(255,50,80,0.3)", alignItems: "center" },
  logoutText: { color: "#ff4466", fontWeight: "800", fontSize: 15 },

  smallBtn:     { backgroundColor: "white", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, alignSelf: "center" },
  smallBtnText: { fontWeight: "800", fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center", padding: 18 },
  modalBox:     { backgroundColor: "#111", borderRadius: 20, padding: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", width: "100%", maxWidth: 360 },
  modalTitle:   { color: "white", fontSize: 18, fontWeight: "900", marginBottom: 6, textAlign: "center" },

  avatarGrid:           { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  avatarOption:         { width: 56, height: 56, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  avatarOptionSelected: { borderColor: "#00e5ff", backgroundColor: "rgba(0,229,255,0.12)" },

  authContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: "#000", gap: 14 },
  authTitle:     { color: "white", fontSize: 42, fontWeight: "900", letterSpacing: 2 },
  authSub:       { color: "#888", fontSize: 15, marginBottom: 8 },
  authInput:     { width: "100%", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, color: "white", fontSize: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  authError:     { color: "#ff4466", fontSize: 13, textAlign: "center" },
  authSuccess:   { color: "#00e5ff", fontSize: 13, textAlign: "center" },
  authBtn:       { width: "100%", backgroundColor: "white", paddingVertical: 15, borderRadius: 999, alignItems: "center", marginTop: 6 },
  authBtnText:   { fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  authToggle:    { color: "#888", fontSize: 13, marginTop: 4, textDecorationLine: "underline" },

  nav: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: NAV_HEIGHT,
    paddingBottom: 10, paddingTop: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.92)",
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
    zIndex: 50,
  },
  navItem:       { width: 72, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 6, borderRadius: 14 },
  navItemActive: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  navIcon:       { fontSize: 18, opacity: 0.8 },
  navIconActive: { opacity: 1 },
  navText:       { color: "#bbb", fontSize: 10, fontWeight: "700" },
  navTextActive: { color: "white" },
  navCenter:     { width: 54, height: 54, borderRadius: 999, backgroundColor: "white", alignItems: "center", justifyContent: "center", marginBottom: 18, borderWidth: 2, borderColor: "rgba(0,0,0,0.35)" },
  navCenterText: { fontSize: 22 },

  choiceBtn:     { width: "100%", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center" },
  choiceBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  resultRow:   { width: "100%", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", flexDirection: "row", justifyContent: "space-between" },
  resultLabel: { fontWeight: "900" },
  resultValue: { color: "#fff", fontWeight: "900" },

  mapModePill:  { position: "absolute", left: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" },
  mapModeTitle: { color: "#fff", fontWeight: "900", fontSize: 13 },
  mapModeSub:   { color: "#aaa", marginTop: 2, fontSize: 11 },
});