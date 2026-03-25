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
  Image,
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
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PagerView from "react-native-pager-view";
import Mapbox from "@rnmapbox/maps";
import { supabase } from "./lib/supabase";
import PulseRings from "./PulseRings";
import VenueExtrusionLayer from "./VenueExtrusionLayer";
import MapRippleLayer from "./MapRippleLayer";
import TonightPlansScreen from "./TonightPlansScreen";
import PulseLoadingScreen from "./PulseLoadingScreen";
import { Ionicons } from "@expo/vector-icons";

// NOTIFICATIONS_DISABLED: import * as Notifications from "expo-notifications";
import BoostDashboardScreen from "./screens/BoostDashboardScreen";
import WrappedScreen from "./screens/WrappedScreen";

// NOTIFICATIONS_DISABLED: Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge:  false,
//   }),
// });

// Set your Mapbox public token (pk.eyJ1...). Use EXPO_PUBLIC_MAPBOX_TOKEN env var
// or replace the empty string with your token directly.
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const AUTO_PULSE_EVERY_MS     = 90_000;
const PULSE_TTL_MINUTES       = 30;
const MANUAL_COOLDOWN_SECONDS = 60;
const VENUE_RADIUS_METERS     = 1500;
const VENUE_MAX               = 80;
const BPM_WINDOW_MINUTES      = 10;
const PULSE_VENUE_LINK_RADIUS    = 150; // metres — auto-link a pulse to nearest venue within this radius
const PULSE_REACTION_RADIUS_M    = 500;  // metres — production distance filter (only used when DEBUG_PULSE_REACTIONS is false)
const DEBUG_PULSE_REACTIONS      = true; // true → all visible venues react; false → real distance filter
const MS_PER_MIN              = 60_000;
const MAP_MAX_PULSE_POINTS    = 320;
const MAP_MAX_VENUE_POINTS    = 120;
const NAV_HEIGHT              = 74;
const BPM_ALERT_THRESHOLD     = 50;
const BPM_ALERT_SHOW_MS       = 5000;
const SKIA_ANIMATION_MS       = 4600;

// ── Venue reaction animation
const VENUE_REACTION_DURATION_MS  = 700;   // how long venue stays in reactingVenueIds set
const VENUE_REACTION_SCALE_DEBUG  = 1.45;  // scale target in debug mode (passed to VenueLayer via debugMode flag)
const VENUE_REACTION_SCALE_PROD   = 1.25;  // scale target in production

// ── Screen edge glow
const EDGE_GLOW_DURATION_MS        = 3000;   // total breathing cycle
const EDGE_GLOW_EDGE_THICKNESS     = 22;     // px — thin aura hugging the frame
const EDGE_GLOW_MAX_OPACITY        = 0.52;   // peak of breathing envelope (40–50% weaker than before)
const EDGE_GLOW_BREATHE_MIN_OP     = 0.34;   // trough between the two breath beats
const EDGE_GLOW_BREATHE_MAX_OP     = 0.52;   // crest of each beat
const EDGE_GLOW_INNER_FEATHER      = 0.14;   // fraction of T for the hottest innermost strip
const EDGE_GLOW_CORNER_BOOST       = 1.0;    // corners are naturally boosted by strip overlap — no extra needed
const EDGE_GLOW_BOTTOM_OFFSET      = NAV_HEIGHT; // renders above nav bar

// ── Threshold banner
const THRESHOLD_BANNER_DURATION_MS = 5000; // total display time
const THRESHOLD_BANNER_ANIMATE_MS  = 280;  // slide-in / slide-out animation duration

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

// Returns the nearest venue within radiusM metres, or null.
const nearestVenueWithinRadius = (lat, lon, venues, radiusM) => {
  let best = null, bestDist = Infinity;
  for (const v of venues) {
    const d = haversineMeters(lat, lon, v.latitude, v.longitude);
    if (d <= radiusM && d < bestDist) { best = v; bestDist = d; }
  }
  return best;
};

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

// Mapbox dark style URL — used in MapPane
const MAPBOX_DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

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
// MapRippleCircles — georeferenced ripple inside MapView
// ─────────────────────────────────────────────────────────────────────────────
// MapRippleCircles removed — replaced by MapRippleLayer (geo-native Mapbox layers)

// ─────────────────────────────────────────────────────────────────────────────
// EdgePulseOverlay — thin neon border aura that breathes for 3 s
//
// Design:
//   • 4 static layers per edge (no blobs, no circles), T = 22 px total depth
//   • Colours: outer deep-purple → inner hot-pink, matching the existing
//     purple/pink brand palette
//   • Single Animated.View opacity drives everything → useNativeDriver:true
//   • Corners get natural boost from overlapping edge strips (no extra geometry)
//   • Two-beat breathing envelope: fade-in → inhale → exhale → inhale → fade-out
// ─────────────────────────────────────────────────────────────────────────────
function EdgePulseOverlay({ visible, onFinish }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { progress.setValue(0); return; }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: EDGE_GLOW_DURATION_MS,
      easing: Easing.linear,       // breathing shape is all in the interpolation
      useNativeDriver: true,       // opacity only — safe for native thread
    });
    anim.start(({ finished }) => {
      if (finished) { progress.setValue(0); if (onFinish) onFinish(); }
    });
    return () => { anim.stop(); progress.setValue(0); };
  }, [visible]);

  // Two-beat breathing curve over the full 3 s duration:
  //   0.00 → silent          (0 ms)
  //   0.08 → first inhale    (240 ms in)
  //   0.27 → peak            (810 ms)
  //   0.46 → exhale trough   (1380 ms)
  //   0.65 → second inhale   (1950 ms)
  //   0.80 → fade begins     (2400 ms)
  //   0.93 → nearly gone     (2790 ms)
  //   1.00 → silent          (3000 ms)
  const breathe = progress.interpolate({
    inputRange:  [0,    0.08, 0.27, 0.46, 0.65, 0.80, 0.93, 1.0 ],
    outputRange: [0,    0.28, EDGE_GLOW_BREATHE_MAX_OP,
                              EDGE_GLOW_BREATHE_MIN_OP,
                              EDGE_GLOW_BREATHE_MAX_OP, 0.36, 0.14, 0   ],
    extrapolate: 'clamp',
  });

  const T  = EDGE_GLOW_EDGE_THICKNESS;   // 22 px
  const BO = EDGE_GLOW_BOTTOM_OFFSET;    // NAV_HEIGHT

  // ── Layer stack (4 per edge, outermost→innermost) ──────────────────────────
  // Each successive layer is narrower and more opaque, building a stepped
  // falloff from the screen edge inward.  Effective combined alpha at the very
  // edge ≈ 0.42 (before breathing multiplier), fading to ~0.05 at T pixels in.
  //
  //   Layer  height/width  color                   alpha
  //   ─────  ───────────── ──────────────────────── ─────
  //   A (outer)   T px     deep purple              0.05
  //   B           T×0.60   purple                   0.09
  //   C           T×0.34   purple-magenta           0.14
  //   D (inner)   T×0.14   hot pink                 0.22

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.edgePulseContainer, { opacity: breathe }]}
    >
      {/* ── Top edge ─────────────────────────────────────────────────────── */}
      <View style={{ position:'absolute', top:0, left:0, right:0, height:T,        backgroundColor:'rgba(110,30,200,0.05)' }} />
      <View style={{ position:'absolute', top:0, left:0, right:0, height:T*0.60,   backgroundColor:'rgba(148,40,220,0.09)' }} />
      <View style={{ position:'absolute', top:0, left:0, right:0, height:T*0.34,   backgroundColor:'rgba(192,50,210,0.14)' }} />
      <View style={{ position:'absolute', top:0, left:0, right:0, height:T*0.14,   backgroundColor:'rgba(236,72,153,0.22)' }} />

      {/* ── Bottom edge (above nav bar) ──────────────────────────────────── */}
      <View style={{ position:'absolute', bottom:BO, left:0, right:0, height:T,      backgroundColor:'rgba(110,30,200,0.05)' }} />
      <View style={{ position:'absolute', bottom:BO, left:0, right:0, height:T*0.60, backgroundColor:'rgba(148,40,220,0.09)' }} />
      <View style={{ position:'absolute', bottom:BO, left:0, right:0, height:T*0.34, backgroundColor:'rgba(192,50,210,0.14)' }} />
      <View style={{ position:'absolute', bottom:BO, left:0, right:0, height:T*0.14, backgroundColor:'rgba(236,72,153,0.22)' }} />

      {/* ── Left edge ────────────────────────────────────────────────────── */}
      <View style={{ position:'absolute', top:0, bottom:BO, left:0, width:T,        backgroundColor:'rgba(110,30,200,0.05)' }} />
      <View style={{ position:'absolute', top:0, bottom:BO, left:0, width:T*0.60,   backgroundColor:'rgba(148,40,220,0.09)' }} />
      <View style={{ position:'absolute', top:0, bottom:BO, left:0, width:T*0.34,   backgroundColor:'rgba(192,50,210,0.14)' }} />
      <View style={{ position:'absolute', top:0, bottom:BO, left:0, width:T*0.14,   backgroundColor:'rgba(236,72,153,0.22)' }} />

      {/* ── Right edge ───────────────────────────────────────────────────── */}
      <View style={{ position:'absolute', top:0, bottom:BO, right:0, width:T,       backgroundColor:'rgba(110,30,200,0.05)' }} />
      <View style={{ position:'absolute', top:0, bottom:BO, right:0, width:T*0.60,  backgroundColor:'rgba(148,40,220,0.09)' }} />
      <View style={{ position:'absolute', top:0, bottom:BO, right:0, width:T*0.34,  backgroundColor:'rgba(192,50,210,0.14)' }} />
      <View style={{ position:'absolute', top:0, bottom:BO, right:0, width:T*0.14,  backgroundColor:'rgba(236,72,153,0.22)' }} />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BpmAlertBanner — slides up on show, slides down on hide
// ─────────────────────────────────────────────────────────────────────────────
function BpmAlertBanner({ message, visible }) {
  const slideY      = useRef(new Animated.Value(40)).current;
  const opacity     = useRef(new Animated.Value(0)).current;
  const [shown, setShown]         = useState(false);
  const [displayMsg, setDisplayMsg] = useState(message || "");

  useEffect(() => {
    if (visible && message) {
      setDisplayMsg(message);
      setShown(true);
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 0, duration: THRESHOLD_BANNER_ANIMATE_MS,
                                    easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: THRESHOLD_BANNER_ANIMATE_MS,
                                    useNativeDriver: true }),
      ]).start();
    } else if (!visible) {
      Animated.parallel([
        Animated.timing(slideY,  { toValue: 40, duration: THRESHOLD_BANNER_ANIMATE_MS,
                                    easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: THRESHOLD_BANNER_ANIMATE_MS,
                                    useNativeDriver: true }),
      ]).start(() => setShown(false));
    }
  }, [visible, message]);

  if (!shown && !visible) return null;

  return (
    <Animated.View pointerEvents="none"
      style={[styles.alertBannerWrap, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={styles.alertBanner}>
        <Text style={styles.alertBannerText} numberOfLines={2}>{displayMsg}</Text>
      </View>
    </Animated.View>
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
const AccountScreen = ({ session, profile, pulseHistory, onLogout, onSaveProfile, onDeleteFavourite, bpmAlertsEnabled, onToggleBpmAlerts, onOpenBoostDashboard }) => {
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
          {profile?.role === "venue_business" && (
            <View style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(168,85,247,0.18)", borderWidth: 1, borderColor: "rgba(168,85,247,0.50)", alignSelf: "center" }}>
              <Text style={{ color: "#d8b4fe", fontWeight: "900", fontSize: 11, letterSpacing: 1.2 }}>VENUE BUSINESS</Text>
            </View>
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

        {profile?.role === "venue_business" && (
          <Pressable style={styles.boostMgrBtn} onPress={onOpenBoostDashboard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ fontSize: 22 }}>⚡</Text>
              <View>
                <Text style={styles.boostMgrTitle}>Manage Boosts</Text>
                <Text style={styles.boostMgrSub}>Send promotions to Pulse users</Text>
              </View>
            </View>
            <Text style={{ color: "rgba(168,85,247,0.55)", fontSize: 18 }}>›</Text>
          </Pressable>
        )}

        <Pressable style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

// AnimatedVenueMarker removed — replaced by VenueLayer (Mapbox ShapeSource + layers)

// ─────────────────────────────────────────────────────────────────────────────
// MapboxPulseLayer — heatmap + dot overlay for pulse data
// ─────────────────────────────────────────────────────────────────────────────
function MapboxPulseLayer({ pulses }) {
  const geojson = useMemo(() => {
    const now      = Date.now();
    const features = (pulses || [])
      .filter((p) => {
        const lat = Number(p.latitude), lon = Number(p.longitude);
        return Number.isFinite(lat) && Number.isFinite(lon) &&
               new Date(p.expiresAt).getTime() > now;
      })
      .slice(0, MAP_MAX_PULSE_POINTS)
      .map((p) => ({
        type: "Feature",
        id:   p.id,
        properties: {
          isVenue:  p.venueId ? 1 : 0,
          isManual: p.source === "manual" ? 1 : 0,
        },
        geometry: {
          type:        "Point",
          coordinates: [Number(p.longitude), Number(p.latitude)],
        },
      }));
    return { type: "FeatureCollection", features };
  }, [pulses]);

  // Colour expressions: venue=gold, manual=white, auto=cyan
  const dotColor = [
    "case",
    ["==", ["get", "isVenue"],  1], "rgba(255,209,102,1)",
    ["==", ["get", "isManual"], 1], "rgba(255,255,255,1)",
    "rgba(0,229,255,1)",
  ];
  const glowRadius = [
    "case",
    ["==", ["get", "isVenue"],  1], 20,
    ["==", ["get", "isManual"], 1], 16,
    14,
  ];
  const coreRadius = [
    "case",
    ["==", ["get", "isVenue"],  1], 10,
    ["==", ["get", "isManual"], 1], 7,
    6,
  ];

  return (
    <Mapbox.ShapeSource id="pulseSource" shape={geojson}>
      {/* Nightlife heatmap — purple/pink gradient, blends clusters into hotspots */}
      {/*
        ── HEATMAP THRESHOLDS (DEV/TESTING MODE) ──────────────────────────────
        Tuned for low-volume testing: 1 pulse = faint glow, 5+ = bright hotspot.
        For production, raise PROD values below (higher intensity = needs more
        pulses before colour appears; lower density stops = colour kicks in sooner).

        Key levers:
          heatmapIntensity  — higher = single points produce stronger density signal
          heatmapRadius     — larger = each point covers more area (also makes sparse
                              data more visible)
          heatmapColor stops — the density values (0–1) at which each colour appears;
                              lower stops = colour appears with fewer/sparser points

        Current (DEV)  →  Production suggestion
          intensity 4.0 →  1.8
          radius 30–80  →  20–60
          first stop 0.05 → 0.15
        ──────────────────────────────────────────────────────────────────────── */}
      <Mapbox.HeatmapLayer
        id="pulseHeatmap"
        style={{
          // Radius grows with zoom so pulses always spread into a visible area
          // DEV: slightly larger so a single point is easy to spot
          heatmapRadius: [
            "interpolate", ["linear"], ["zoom"],
            0,  30,   // DEV: 30  |  PROD: 20
            15, 60,   // DEV: 60  |  PROD: 50
            20, 80,
          ],
          // DEV: 4.0 so even 1 pulse crosses the visible-colour threshold
          // PROD: 1.8
          heatmapIntensity: 4.0,
          // Purple → magenta → hot-pink gradient matching the Pulse brand
          // DEV density stops are low so sparse data is still visible:
          //   ~1 pulse  → density ≈ 0.05–0.15 → faint purple
          //   ~2–3 pulses → density ≈ 0.2–0.4  → solid purple/magenta
          //   ~5+ pulses → density ≈ 0.6+      → bright pink hotspot
          // PROD: shift first meaningful stop back to 0.15 and intensity to 1.8
          heatmapColor: [
            "interpolate", ["linear"], ["heatmap-density"],
            0,    "rgba(0,0,0,0)",
            0.05, "rgba(60,0,100,0.25)",   // DEV: faint glow for 1 pulse
            0.15, "rgba(80,0,120,0.5)",    // DEV: 2–3 pulses visible
            0.35, "rgba(140,0,200,0.7)",
            0.55, "rgba(200,0,180,0.85)",  // DEV: ~5 pulses = bright
            0.75, "rgba(255,30,130,0.95)",
            1,    "rgba(255,100,180,1)",
          ],
          heatmapOpacity: 0.85,
          // Each point's contribution — venue pulses count more
          heatmapWeight: [
            "case",
            ["==", ["get", "isVenue"], 1], 1.5,
            1,
          ],
        }}
      />
      {/* Outer glow — slightly more blur for a premium bloom */}
      <Mapbox.CircleLayer
        id="pulseGlow"
        style={{
          circleRadius:  glowRadius,
          circleColor:   dotColor,
          circleOpacity: 0.14,
          circleBlur:    2.4,
        }}
      />
      {/* Mid bloom — soft halo between glow and core, adds depth */}
      <Mapbox.CircleLayer
        id="pulseMidBloom"
        style={{
          circleRadius: [
            "case",
            ["==", ["get", "isVenue"],  1], 13,
            ["==", ["get", "isManual"], 1], 10,
            8,
          ],
          circleColor:   dotColor,
          circleOpacity: 0.28,
          circleBlur:    0.7,
        }}
      />
      {/* Core dot */}
      <Mapbox.CircleLayer
        id="pulseCore"
        style={{
          circleRadius:  coreRadius,
          circleColor:   dotColor,
          circleOpacity: 0.75,
          circleBlur:    0.2,
        }}
      />
    </Mapbox.ShapeSource>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// UserOrb — custom neon orb replacing the default Mapbox blue location dot.
// Rendered inside a Mapbox.MarkerView so it stays pinned to the user's GPS
// coordinate as the map pans/zooms.
// Exposes flash() via ref for the Pulse button interaction.
// ─────────────────────────────────────────────────────────────────────────────
const UserOrb = React.forwardRef(function UserOrb(_props, ref) {
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.9)).current;
  const breatheRef  = useRef(null);

  const startBreathing = useCallback(() => {
    breatheRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim,   { toValue: 1.08, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.70, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim,   { toValue: 1.00, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.90, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    );
    breatheRef.current.start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startBreathing();
    return () => breatheRef.current?.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = useCallback(() => {
    breatheRef.current?.stop();
    breatheRef.current = null;
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim,   { toValue: 1.25, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1.00, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scaleAnim,   { toValue: 1.00, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.90, duration: 150, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start(() => startBreathing());
  }, [startBreathing]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useImperativeHandle(ref, () => ({ flash }));

  return (
    // Fixed 60×60 container — MarkerView anchors its centre to the coordinate
    <Animated.View
      pointerEvents="none"
      style={{
        width: 60, height: 60,
        alignItems: "center", justifyContent: "center",
        transform: [{ scale: scaleAnim }],
        opacity: opacityAnim,
      }}
    >
      {/* Outer soft pink glow */}
      <View style={{ position: "absolute", width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,79,216,0.10)" }} />
      {/* Mid pink glow */}
      <View style={{ position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,79,216,0.16)" }} />
      {/* Purple inner glow */}
      <View style={{ position: "absolute", width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(138,92,255,0.28)" }} />
      {/* Tight purple halo around core */}
      <View style={{ position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(138,92,255,0.50)" }} />
      {/* Bright core */}
      <View style={{
        width: 12, height: 12, borderRadius: 6,
        backgroundColor: "#F4F4F6",
        shadowColor: "#8A5CFF", shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
        elevation: 10,
      }} />
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MapPane — Mapbox map with native venue + pulse rendering
// mapRef.current is set to an imperative API object so the parent can call
// animateToRegion() and pointForCoordinate() without any JSX changes.
// ─────────────────────────────────────────────────────────────────────────────
function MapPane({ title, subtitle, location, venues, pulses, leaderboard, selectedVenue, setSelectedVenue, mapRef, mapRippleKey, rippleLocation, reactingVenueIds, debugMode, orbRef }) {
  const cameraRef    = useRef(null);
  const mapViewRef   = useRef(null);
  // Fly-in guard — only triggers the polished entry animation once per mount
  const flyInDoneRef = useRef(false);

  // Dash-flow animation for the road rush overlay.
  // lineDashOffset is NOT in rnmapbox's styleMap and must never be used.
  // Animating lineDasharray causes layer recreation ("Layer road-rush is not in style").
  // Solution: 3 LineLayer instances with STATIC dasharray phase-offsets (0, +3, +6 units
  // along a period-9 pattern), and opacity cross-faded 120° apart.  At any moment one
  // phase is fully lit while the others are at their floor value — the visual effect is
  // dashes appearing to travel forward along the road.  Total opacity is constant
  // (no flicker): 3×0.08 + 0.27×½×(cos(f)+cos(f-120°)+cos(f-240°)) = 0.24+0 = 0.24 base.
  const dashFlowRef = useRef(0);
  const [dashFlow, setDashFlow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      dashFlowRef.current += 0.022; // ~11.4 s full cycle — slow, smooth flow
      setDashFlow(dashFlowRef.current);
    }, 40);
    return () => clearInterval(id);
  }, []);

  // Expose a react-native-maps-compatible imperative API on the passed ref
  useEffect(() => {
    if (!mapRef) return;
    mapRef.current = {
      animateToRegion: ({ latitude, longitude }, duration = 650) => {
        cameraRef.current?.setCamera({
          centerCoordinate:  [longitude, latitude],
          zoomLevel:         14,
          pitch:             55,   // preserve 3D tilt during navigation
          heading:           25,   // preserve bearing during navigation
          animationDuration: duration,
          animationMode:     "flyTo",
        });
      },
      // Preserves the existing call signature used by onPulseHere
      pointForCoordinate: async ({ latitude, longitude }) => {
        if (!mapViewRef.current) return null;
        const [x, y] = await mapViewRef.current.getPointInView([longitude, latitude]);
        return { x, y };
      },
    };
    return () => { if (mapRef) mapRef.current = null; };
  }, [mapRef]);

  const handleVenuePress = useCallback(
    (venue) => {
      if (venue) setSelectedVenue(venue);
    },
    [setSelectedVenue],
  );

  if (Platform.OS === "web") {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", justifyContent: "center" }]}>
        <Text style={{ color: "#bbb", textAlign: "center", paddingHorizontal: 20 }}>
          Map view is not available on web.
        </Text>
      </View>
    );
  }

  const centerLng = location?.longitude ?? -6.2603;
  const centerLat = location?.latitude  ?? 53.3498;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Mapbox.MapView
        ref={mapViewRef}
        style={StyleSheet.absoluteFill}
        styleURL={MAPBOX_DARK_STYLE}
        onPress={() => setSelectedVenue(null)}
        rotateEnabled={false}
        attributionEnabled={false}
        logoEnabled={false}
        compassEnabled={false}
        // Polished fly-in on first map load — rises from low zoom + flat angle
        onDidFinishLoadingMap={() => {
          if (flyInDoneRef.current) return;
          flyInDoneRef.current = true;
          setTimeout(() => {
            cameraRef.current?.setCamera({
              centerCoordinate:  [centerLng, centerLat],
              zoomLevel:         14,
              pitch:             55,
              heading:           25,
              animationDuration: 1800,
              animationMode:     "flyTo",
            });
          }, 250);
        }}
      >
        {/* Camera starts zoomed out + flat so the fly-in is visible */}
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [centerLng, centerLat],
            zoomLevel:        12,   // start zoomed out — fly-in brings to 14
            pitch:            28,   // start flatter — fly-in tilts to 55
            heading:          0,    // start north — fly-in rotates to 25
          }}
        />

        {/* ── Neon road overlay — futuristic purple river with rushing lights ── */}
        {/* Two-layer approach:                                                  */}
        {/*   1. Neon purple base  — wide, vivid, full-coverage road colour      */}
        {/*   2. Animated white dashes — narrow, offset-animated for rush effect */}
        <Mapbox.VectorSource id="road-purple-src" url="mapbox://mapbox.mapbox-streets-v8">

          {/* Base: neon purple road fill — road class sets width + opacity hierarchy */}
          {/* No belowLayerID: appends above all dark-v11 base layers so purple is      */}
          {/* actually visible.  road-rush layers are declared after so they sit on top. */}
          <Mapbox.LineLayer
            id="road-purple"
            sourceLayerID="road"
            style={{
              lineColor: ["match", ["get", "class"],
                ["motorway", "trunk"],          "#CC22FF",  // brightest — major arteries
                ["primary"],                    "#BB11EE",  // primary roads
                ["secondary", "tertiary"],       "#9933DD",  // secondary network
                "#8822CC",                                  // streets + everything else
              ],
              lineWidth: [
                "interpolate", ["linear"], ["zoom"],
                10, ["match", ["get", "class"],
                  ["motorway", "trunk"], 3,
                  ["primary"], 2,
                  1,
                ],
                13, ["match", ["get", "class"],
                  ["motorway", "trunk"], 7,
                  ["primary"], 5,
                  ["secondary", "tertiary"], 3.5,
                  2,
                ],
                15, ["match", ["get", "class"],
                  ["motorway", "trunk"], 14,
                  ["primary"], 11,
                  ["secondary", "tertiary"], 7,
                  4,
                ],
                17, ["match", ["get", "class"],
                  ["motorway", "trunk"], 20,
                  ["primary"], 15,
                  ["secondary", "tertiary"], 10,
                  6,
                ],
              ],
              lineOpacity: ["match", ["get", "class"],
                ["motorway", "trunk"],           0.92,
                ["primary"],                     0.85,
                ["secondary", "tertiary"],        0.75,
                0.60,
              ],
              lineCap:  "round",
              lineJoin: "round",
            }}
          />

          {/* Rush overlay: 3 phase-offset white dash layers cross-faded at 120° apart.  */}
          {/* lineDasharray is STATIC on each layer (no recreation errors).             */}
          {/* Only lineOpacity animates — that is safe and does not recreate the layer. */}
          {/* Period = 9 units (2 dash + 7 gap).  Each phase shifts dashes +3 units:    */}
          {/*   Phase 0 → [2, 7]          dash at position 0-2 in each repeat           */}
          {/*   Phase 1 → [0.001, 2.999, 2, 4]  dash at position ~3-5                  */}
          {/*   Phase 2 → [0.001, 5.999, 2, 1]  dash at position ~6-8                  */}
          {/* As phase 0 fades out and phase 1 fades in, dashes visually step forward.  */}
          {(() => {
            const TWO_PI_3 = (2 * Math.PI) / 3;
            const rushOp = (offset) => 0.08 + 0.27 * (1 + Math.cos(dashFlow - offset)) / 2;
            const rushWidth = [
              "interpolate", ["linear"], ["zoom"],
              10, 0.5,
              13, 1.2,
              15, 2.2,
              17, 3.5,
            ];
            const rushFilter = ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]];
            const rushBase = {
              lineColor: "#EEE8FF",
              lineCap:   "round",
              lineJoin:  "round",
              lineWidth: rushWidth,
            };
            return (
              <>
                <Mapbox.LineLayer
                  id="road-rush-0"
                  sourceLayerID="road"
                  filter={rushFilter}
                  style={{ ...rushBase, lineDasharray: [2, 7],                lineOpacity: rushOp(0) }}
                />
                <Mapbox.LineLayer
                  id="road-rush-1"
                  sourceLayerID="road"
                  filter={rushFilter}
                  style={{ ...rushBase, lineDasharray: [0.001, 2.999, 2, 4], lineOpacity: rushOp(TWO_PI_3) }}
                />
                <Mapbox.LineLayer
                  id="road-rush-2"
                  sourceLayerID="road"
                  filter={rushFilter}
                  style={{ ...rushBase, lineDasharray: [0.001, 5.999, 2, 1], lineOpacity: rushOp(2 * TWO_PI_3) }}
                />
              </>
            );
          })()}

        </Mapbox.VectorSource>

        {/* ── 3D Buildings — slightly richer blue-purple for nightlife depth ── */}
        <Mapbox.FillExtrusionLayer
          id="3d-buildings"
          sourceID="composite"
          sourceLayerID="building"
          filter={["==", "extrude", "true"]}
          minZoomLevel={13}
          style={{
            fillExtrusionColor:   "#1c1828",   // deeper navy-purple for atmosphere
            fillExtrusionHeight:  ["get", "height"],
            fillExtrusionBase:    ["get", "min_height"],
            fillExtrusionOpacity: 0.82,        // slightly more solid for depth
          }}
        />

        {/* ── Custom user location orb (replaces native blue dot) ── */}
        {location && (
          <Mapbox.MarkerView
            id="user-location-orb"
            coordinate={[location.longitude, location.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <UserOrb ref={orbRef} />
          </Mapbox.MarkerView>
        )}

        {/* ── Pulse halo dots ── */}
        <MapboxPulseLayer pulses={pulses} />

        {/* ── Geo-referenced ripple on pulse trigger ── */}
        <MapRippleLayer
          latitude={rippleLocation?.latitude}
          longitude={rippleLocation?.longitude}
          pulseKey={mapRippleKey}
        />

        {/* ── Venue buildings (3D fill-extrusion) ── */}
        <VenueExtrusionLayer
          venues={venues}
          leaderboard={leaderboard}
          selectedVenueId={selectedVenue?.id}
          reactingVenueIds={reactingVenueIds}
          onPress={handleVenuePress}
        />
      </Mapbox.MapView>

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
  const [planShowPicker, setPlanShowPicker] = useState(false);

  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLoader,  setShowLoader]  = useState(true);

  const [profile,      setProfile]      = useState(null);
  const [pulseHistory, setPulseHistory] = useState([]);

  const [status,   setStatus]   = useState("Booting…");
  const [location, setLocation] = useState(null);

  const [pulses, setPulses] = useState([]);
  const [venues, setVenues] = useState([]);
  const venuesRef = useRef([]);

  const [selectedVenue,    setSelectedVenue]    = useState(null);
  const [cooldownLeft,     setCooldownLeft]     = useState(0);
  const [reactingVenueIds, setReactingVenueIds] = useState(() => new Set());

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

  const orbRefAll     = useRef(null);
  const orbRefAge     = useRef(null);
  const orbRefFriends = useRef(null);

  const [showAgeModal, setShowAgeModal] = useState(false);

  const [showDailyPrompt,  setShowDailyPrompt]  = useState(false);
  const [dailySubmitting,  setDailySubmitting]  = useState(false);
  const [dailyChoice,      setDailyChoice]      = useState(null);
  const [showDailyResults, setShowDailyResults] = useState(false);
  const [dailyStats,       setDailyStats]       = useState({ total: 0, yes: 0, maybe: 0, no: 0 });

  // ── Ripple ─────────────────────────────────────────────────────────────────
  const [mapRippleKey,    setMapRippleKey]    = useState(0);
  const [rippleLocation,  setRippleLocation]  = useState(null);
  const [pulseScreenPos,  setPulseScreenPos]  = useState(null);

  // ── Skia PulseRings ───────────────────────────────────────────────────────
  const pulseRingsRef      = useRef(null);
  const [showPulseRings,   setShowPulseRings] = useState(false);
  const pulseRingsTimerRef = useRef(null);

  // ── Boosts ────────────────────────────────────────────────────────────────
  const [activeBoosts,       setActiveBoosts]       = useState([]);
  const [showBoostDashboard, setShowBoostDashboard] = useState(false);

  // ── Wrapped ───────────────────────────────────────────────────────────────
  const [showWrapped, setShowWrapped] = useState(false);

  // ── BPM alerts ────────────────────────────────────────────────────────────
  const [bpmAlertsEnabled, setBpmAlertsEnabled] = useState(true);
  const [alertMessage,     setAlertMessage]     = useState("");
  const [showAlertBanner,  setShowAlertBanner]  = useState(false);
  const [showEdgePulse,    setShowEdgePulse]    = useState(false);
  const alertTimerRef     = useRef(null);
  const pulseGlowTimerRef = useRef(null);
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

  // ── triggerPulseRipple — geo-referenced map ripple ────────────────────────
  const triggerPulseRipple = (loc) => {
    if (loc?.latitude && loc?.longitude) {
      setRippleLocation({ latitude: loc.latitude, longitude: loc.longitude });
      setMapRippleKey((k) => k + 1);
    }
  };

  // showThresholdBanner — display the floating banner and edge glow for any BPM milestone
  const showThresholdBanner = useCallback((venueName, bpm) => {
    setAlertMessage(`${venueName} just reached ${bpm} bpm`);
    setShowAlertBanner(true);
    setShowEdgePulse(true);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    alertTimerRef.current = setTimeout(() => {
      setShowAlertBanner(false);
      setAlertMessage("");
      setShowEdgePulse(false);
    }, THRESHOLD_BANNER_DURATION_MS);
  }, []);

  const triggerBpmAlert = useCallback((venueName) => {
    showThresholdBanner(venueName, BPM_ALERT_THRESHOLD);
  }, [showThresholdBanner]);

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const raw = await AsyncStorage.getItem("pulse_bpm_alerts_enabled");
        setBpmAlertsEnabled(raw == null ? true : raw === "true");
      } catch { setBpmAlertsEnabled(true); }
    };
    loadSetting();
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      if (pulseGlowTimerRef.current) clearTimeout(pulseGlowTimerRef.current);
    };
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

  // ── Active boosts — load + realtime ───────────────────────────────────────
  const loadActiveBoosts = async () => {
    const { data } = await supabase
      .from("boosts")
      .select("id, venue_id, venue_name, boost_type, message, duration_minutes, created_at, expires_at")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    setActiveBoosts(data || []);
  };

  useEffect(() => {
    loadActiveBoosts();
    const ch = supabase.channel("boosts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "boosts" }, () => {
        loadActiveBoosts();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // NOTIFICATIONS_DISABLED: Push notification registration + tap handler
  // useEffect(() => {
  //   if (!session?.user?.id) return;
  //   const registerToken = async () => {
  //     try {
  //       const { status: existing } = await Notifications.getPermissionsAsync();
  //       let finalStatus = existing;
  //       if (existing !== "granted") {
  //         const { status } = await Notifications.requestPermissionsAsync();
  //         finalStatus = status;
  //       }
  //       if (finalStatus !== "granted") return;
  //       const tokenData = await Notifications.getExpoPushTokenAsync();
  //       const token = tokenData?.data;
  //       if (token) {
  //         await supabase.from("profiles").update({ push_token: token }).eq("id", session.user.id);
  //       }
  //     } catch {}
  //   };
  //   registerToken();
  //
  //   const sub = Notifications.addNotificationResponseReceivedListener((response) => {
  //     const data = response.notification.request.content.data;
  //     if (data?.screen === "plans")   setTab("plans");
  //     if (data?.screen === "wrapped") setShowWrapped(true);
  //   });
  //   return () => sub.remove();
  // }, [session?.user?.id]);

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

        const nearVenue0 = nearestVenueWithinRadius(fix.latitude, fix.longitude, venuesRef.current, PULSE_VENUE_LINK_RADIUS);
        await addPulseToDb({ lat: fix.latitude, lon: fix.longitude, source: "auto", venueId: nearVenue0?.id ?? null });

        timerRef.current = setInterval(async () => {
          try {
            const f = await getOneLocationFix();
            setLocation(f);
            const nearVenue = nearestVenueWithinRadius(f.latitude, f.longitude, venuesRef.current, PULSE_VENUE_LINK_RADIUS);
            await addPulseToDb({ lat: f.latitude, lon: f.longitude, source: "auto", venueId: nearVenue?.id ?? null });
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
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, 120);
      } catch (_) {}
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

      // Flash the user orb, then fire ripple + rings after the flash peak
      const activeOrbRef = [orbRefAll, orbRefAge, orbRefFriends][mapPage] ?? orbRefAll;
      activeOrbRef.current?.flash();
      await new Promise((r) => setTimeout(r, 300));

      triggerPulseRipple(fix);
      triggerPulseAnimation();   // ← Skia rings for 5s

      // Edge glow fires on every user pulse
      if (pulseGlowTimerRef.current) clearTimeout(pulseGlowTimerRef.current);
      setShowEdgePulse(true);
      pulseGlowTimerRef.current = setTimeout(() => setShowEdgePulse(false), EDGE_GLOW_DURATION_MS);

      // ── Traveling-wave venue reactions ────────────────────────────────────────
      // DEBUG_PULSE_REACTIONS = true  → all visible venues react regardless of distance
      // DEBUG_PULSE_REACTIONS = false → only venues within PULSE_REACTION_RADIUS_M react
      const allVenues = venuesRef.current;
      const venuesToReact = DEBUG_PULSE_REACTIONS
        ? allVenues
        : allVenues.filter((v) =>
            haversineMeters(fix.latitude, fix.longitude, v.latitude, v.longitude) < PULSE_REACTION_RADIUS_M
          );

      console.log(`[PULSE] venues loaded: ${allVenues.length} | venues triggered: ${venuesToReact.length}`);
      console.log(`[PULSE] first 5 triggered:`, venuesToReact.slice(0, 5).map((v) => `${v.id} (${v.name ?? "unnamed"})`));

      // Compute per-venue delays and log each one (debug only — remove logs in production)
      const venueDelays = venuesToReact.map((v) => {
        const dist  = haversineMeters(fix.latitude, fix.longitude, v.latitude, v.longitude);
        const delay = Math.min(150, dist * 0.3);
        console.log(`[PULSE REACTION] "${v.name ?? v.id}" | dist: ${dist.toFixed(0)}m | delay: ${delay.toFixed(0)}ms`);
        return { id: v.id, delay };
      });

      // Bucket venues by delay (rounded to nearest 50ms) to minimise state updates
      const buckets = {}; // delay → [venueId, ...]
      for (const { id, delay } of venueDelays) {
        const bucket = Math.round(delay / 50) * 50;
        (buckets[bucket] = buckets[bucket] || []).push(id);
      }

      for (const [bucketDelay, ids] of Object.entries(buckets)) {
        setTimeout(() => {
          setReactingVenueIds((prev) => new Set([...prev, ...ids]));
          setTimeout(() => {
            setReactingVenueIds((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.delete(id));
              return next;
            });
          }, VENUE_REACTION_DURATION_MS);
        }, Number(bucketDelay));
      }
      const linkedVenue = selectedVenue ?? nearestVenueWithinRadius(fix.latitude, fix.longitude, venuesRef.current, PULSE_VENUE_LINK_RADIUS);
      await addPulseToDb({ lat: fix.latitude, lon: fix.longitude, source: "manual", venueId: linkedVenue?.id ?? null });
      setCooldownLeft(MANUAL_COOLDOWN_SECONDS);
      if (selectedVenue) addFavouriteVenue(selectedVenue);
    } catch (e) { setStatus(`Pulse error: ${String(e?.message || e)}`); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  // Show the animated logo loader until auth resolves AND fade-out completes.
  if (authLoading || showLoader) {
    return (
      <PulseLoadingScreen
        loading={authLoading}
        onFadeComplete={() => setShowLoader(false)}
      />
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
                  leaderboard={leaderboard} selectedVenue={selectedVenue} setSelectedVenue={setSelectedVenue}
                  mapRef={mapRefAll} mapRippleKey={mapRippleKey} rippleLocation={rippleLocation} reactingVenueIds={reactingVenueIds} debugMode={DEBUG_PULSE_REACTIONS} orbRef={orbRefAll} />
              </View>
              <View key="age">
                <MapPane title="Your Age Bracket" subtitle={profile?.age_bracket || "Set age bracket"} location={location} venues={venues} pulses={pulsesAge}
                  leaderboard={leaderboard} selectedVenue={selectedVenue} setSelectedVenue={setSelectedVenue}
                  mapRef={mapRefAge} mapRippleKey={mapRippleKey} rippleLocation={rippleLocation} reactingVenueIds={reactingVenueIds} debugMode={DEBUG_PULSE_REACTIONS} orbRef={orbRefAge} />
              </View>
              <View key="friends">
                <MapPane title="Friends" subtitle={friendIds.length ? `${friendIds.length} friends` : "No friends added yet"} location={location} venues={venues} pulses={pulsesFriends}
                  leaderboard={leaderboard} selectedVenue={selectedVenue} setSelectedVenue={setSelectedVenue}
                  mapRef={mapRefFriends} mapRippleKey={mapRippleKey} rippleLocation={rippleLocation} reactingVenueIds={reactingVenueIds} debugMode={DEBUG_PULSE_REACTIONS} orbRef={orbRefFriends} />
              </View>
            </PagerView>

            <View style={styles.topOverlay}>
              <Pressable style={[styles.button, cooldownLeft > 0 && styles.buttonDisabled]} onPress={onPulseHere} disabled={cooldownLeft > 0}>
                <Text style={styles.buttonText}>{cooldownLeft > 0 ? `WAIT ${cooldownLeft}s` : selectedVenue ? "PULSE HERE" : "PULSE"}</Text>
              </Pressable>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
                <View style={styles.pageDotWrap}>
                  {[0, 1, 2].map((i) => (
                    <Text key={i} style={[styles.pageDot, mapPage === i && styles.pageDotActive]}>●</Text>
                  ))}
                </View>
              </View>
              <Text style={styles.status}>Pulses: {pulses.length} • Venues: {venues.length}</Text>
            </View>

            {/* Ripple ring animation — fixed 140×140 wrapper, originates at user location */}
            {showPulseRings && (
              <PulseRings
                ref={pulseRingsRef}
                visible={showPulseRings}
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

        {tab === "plans"   && <View style={{ flex: 1, backgroundColor: "#000" }}><TonightPlansScreen venues={venues} leaderboard={leaderboard} session={session} showPickerOnMount={planShowPicker} activeBoosts={activeBoosts} onNavigateToMap={() => setTab("map")} onOpenWrapped={() => setShowWrapped(true)} /></View>}
        {tab === "events"  && <View style={{ flex: 1, backgroundColor: "#000" }}><LeaderboardScreen leaderboard={leaderboard} /></View>}
        {tab === "friends" && <View style={{ flex: 1, backgroundColor: "#000" }}><FriendsScreen myUsername={profile?.username || ""} outgoing={outgoingReq} incoming={incomingReq} friends={friendsList} onSendRequest={sendFriendRequestByUsername} onRespondRequest={respondToFriendRequest} refreshing={friendsRefreshing} onRefresh={loadFriendsData} /></View>}
        {tab === "account" && <View style={{ flex: 1, backgroundColor: "#000" }}><AccountScreen session={session} profile={profile} pulseHistory={pulseHistory} onLogout={onLogout} onSaveProfile={onSaveProfile} onDeleteFavourite={onDeleteFavourite} bpmAlertsEnabled={bpmAlertsEnabled} onToggleBpmAlerts={toggleBpmAlerts} onOpenBoostDashboard={() => setShowBoostDashboard(true)} /></View>}
      </View>

      <BpmAlertBanner message={alertMessage} visible={showAlertBanner} />
      {showEdgePulse && <EdgePulseOverlay visible={showEdgePulse} onFinish={() => setShowEdgePulse(false)} />}

      {/* Nav bar */}
      <View style={styles.nav}>
        <Pressable style={[styles.navItem, tab === "map"     && styles.navItemActive]} onPress={() => setTab("map")}>
          <Image source={require("./NavIcons/map.png")} style={styles.navIcon} />
          <Text style={[styles.navText, tab === "map"     && styles.navTextActive]}>Map</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "plans"   && styles.navItemActive]} onPress={() => { setSelectedVenue(null); setPlanShowPicker(false); setTab("plans"); }}>
          <Image source={require("./NavIcons/eventplanner.png")} style={styles.navIcon} />
          <Text style={[styles.navText, tab === "plans"   && styles.navTextActive]}>Tonight</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "events"  && styles.navItemActive]} onPress={() => { setSelectedVenue(null); setTab("events"); }}>
          <Image source={require("./NavIcons/tonightsleaderboard.png")} style={styles.navIcon} />
          <Text style={[styles.navText, tab === "events"  && styles.navTextActive]}>Leaderboard</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "friends" && styles.navItemActive]} onPress={() => { setSelectedVenue(null); setTab("friends"); }}>
          <Image source={require("./NavIcons/friends.png")} style={styles.navIcon} />
          <Text style={[styles.navText, tab === "friends" && styles.navTextActive]}>Friends</Text>
        </Pressable>
        <Pressable style={[styles.navItem, tab === "account" && styles.navItemActive]} onPress={() => setTab("account")}>
          <Image source={require("./NavIcons/profile.png")} style={styles.navIcon} />
          <Text style={[styles.navText, tab === "account" && styles.navTextActive]}>{profile?.username ? profile.username.slice(0, 8) : "Profile"}</Text>
        </Pressable>
      </View>

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

      {/* Pulse Wrapped — last night recap */}
      <Modal visible={showWrapped} animationType="slide" onRequestClose={() => setShowWrapped(false)}>
        <WrappedScreen
          session={session}
          venues={venues}
          onNavigate={(t) => setTab(t)}
          onClose={() => setShowWrapped(false)}
        />
      </Modal>

      {/* Boost Dashboard — full-screen modal for venue_business users */}
      <Modal visible={showBoostDashboard} animationType="slide" onRequestClose={() => setShowBoostDashboard(false)}>
        <BoostDashboardScreen
          managedVenueId={profile?.managed_venue_id}
          managedVenueName={profile?.managed_venue_name}
          session={session}
          onClose={() => setShowBoostDashboard(false)}
        />
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
// ── Glass design tokens ───────────────────────────────────────────────────────
// Dark translucent + purple/pink border glow + neon shadow
const G = {
  bg:         "rgba(10, 6, 20, 0.82)",
  bgDeep:     "rgba(8, 4, 18, 0.94)",
  bgSubtle:   "rgba(14, 9, 28, 0.70)",
  border:     "rgba(168, 85, 247, 0.40)",
  borderViv:  "rgba(168, 85, 247, 0.65)",
  borderPink: "rgba(236, 72, 153, 0.65)",
  borderFaint:"rgba(168, 85, 247, 0.22)",
  shadow:     "#A855F7",
  shadowPink: "#EC4899",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#05020E" },

  // ── Top overlay — glass card floating above the map ───────────────────────
  topOverlay: {
    position: "absolute", top: 50, left: 16, right: 16,
    alignItems: "center", gap: 8, zIndex: 20,
    backgroundColor: G.bg,
    borderRadius: 24,
    borderWidth: 1, borderColor: G.border,
    paddingHorizontal: 16, paddingVertical: 10,
    shadowColor: G.shadow, shadowOpacity: 0.40, shadowRadius: 28,
    shadowOffset: { width: 0, height: 4 }, elevation: 14,
  },
  title: { color: "white", fontSize: 28, fontWeight: "700", letterSpacing: 1 },

  // ── Pulse button — neon glass pill ────────────────────────────────────────
  button: {
    paddingVertical: 14, paddingHorizontal: 26, borderRadius: 999,
    backgroundColor: "rgba(168, 85, 247, 0.18)",
    borderWidth: 1.5, borderColor: G.borderViv,
    shadowColor: G.shadow, shadowOpacity: 0.60, shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { fontWeight: "900", fontSize: 16, letterSpacing: 1, color: "#fff" },
  status: { color: "rgba(200,180,255,0.75)", fontSize: 12, textAlign: "center" },

  // ── Page dots ─────────────────────────────────────────────────────────────
  pageDotWrap: {
    flexDirection: "row", gap: 8,
    backgroundColor: G.bgSubtle,
    borderWidth: 1, borderColor: G.borderFaint,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  pageDot:       { color: "rgba(168,85,247,0.40)", fontSize: 10 },
  pageDotActive: { color: "#d8b4fe" },

  edgePulseContainer: { ...StyleSheet.absoluteFillObject, zIndex: 55, pointerEvents: 'none' },

  // ── BPM alert banner — vivid glass with purple glow ───────────────────────
  alertBannerWrap: {
    position: "absolute", left: 16, right: 16, bottom: NAV_HEIGHT + 18,
    zIndex: 45, alignItems: "center",
  },
  alertBanner: {
    width: "100%", maxWidth: 420,
    backgroundColor: G.bgDeep, borderRadius: 18,
    borderWidth: 1.5, borderColor: G.borderViv,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: G.shadow, shadowOpacity: 0.60, shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 }, elevation: 18,
  },
  alertBannerText: { color: "#fff", textAlign: "center", fontWeight: "900", fontSize: 14 },

  // ── Venue bottom sheet — glass panel ─────────────────────────────────────
  sheet: {
    position: "absolute", left: 12, right: 12, bottom: 12,
    backgroundColor: G.bg, borderRadius: 24,
    borderWidth: 1, borderColor: G.border,
    padding: 14, gap: 10, zIndex: 15,
    marginBottom: NAV_HEIGHT + 6,
    shadowColor: G.shadow, shadowOpacity: 0.45, shadowRadius: 26,
    shadowOffset: { width: 0, height: 4 }, elevation: 16,
  },
  sheetRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sheetTitle: { color: "white", fontSize: 17, fontWeight: "800", flex: 1 },
  close:      { color: "rgba(200,180,255,0.80)", fontSize: 18, paddingHorizontal: 8, paddingVertical: 2 },
  sheetStats: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  statBox: {
    flex: 1, backgroundColor: "rgba(168, 85, 247, 0.08)", borderRadius: 14,
    paddingVertical: 10, alignItems: "center",
    borderWidth: 1, borderColor: G.borderFaint,
  },
  statBoxHighlight: { borderColor: "rgba(0,229,255,0.40)", backgroundColor: "rgba(0,229,255,0.10)" },
  statValue:  { color: "white", fontSize: 17, fontWeight: "900" },
  statLabel:  { color: "rgba(200,180,255,0.65)", fontSize: 10, marginTop: 2 },
  sheetTiny:  { color: "rgba(168,85,247,0.55)", fontSize: 11 },

  // ── Leaderboard ───────────────────────────────────────────────────────────
  leaderHeader: { paddingHorizontal: 14, paddingBottom: 10 },
  leaderTitle:  { color: "white", fontSize: 20, fontWeight: "900" },
  leaderSub:    { color: "rgba(200,180,255,0.65)", marginTop: 4, fontSize: 12 },
  leaderRow: {
    backgroundColor: G.bgSubtle, borderRadius: 16,
    borderWidth: 1, borderColor: G.borderFaint,
    padding: 12, marginBottom: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12,
    shadowColor: G.shadow, shadowOpacity: 0.18, shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  rank:      { color: "#d8b4fe", fontWeight: "900", width: 22, textAlign: "center" },
  venueName: { color: "white", fontSize: 14, fontWeight: "800" },
  venueMeta: { color: "rgba(200,180,255,0.60)", fontSize: 11, marginTop: 2 },
  bpmPill: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.40)", borderWidth: 1, borderRadius: 999,
    paddingVertical: 8, paddingHorizontal: 12, alignItems: "center", minWidth: 74,
    shadowColor: "#00e5ff", shadowOpacity: 0.30, shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  bpmValue:  { color: "white", fontWeight: "900", fontSize: 16, lineHeight: 18 },
  bpmLabel:  { color: "#a5f3ff", fontSize: 10, marginTop: 2 },

  // ── Profile card ──────────────────────────────────────────────────────────
  profileCard: {
    alignItems: "center", padding: 24,
    backgroundColor: G.bg, borderRadius: 24,
    borderWidth: 1, borderColor: G.border, marginBottom: 24, gap: 8,
    shadowColor: G.shadow, shadowOpacity: 0.32, shadowRadius: 22,
    shadowOffset: { width: 0, height: 4 }, elevation: 12,
  },
  avatarCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(168, 85, 247, 0.14)", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: G.border,
  },
  avatarEmoji:     { fontSize: 40 },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    backgroundColor: "rgba(168,85,247,0.50)", borderRadius: 999, width: 22, height: 22,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: G.borderViv,
  },
  usernameRow:     { flexDirection: "row", alignItems: "center", gap: 8 },
  usernameInput:   { color: "white", fontSize: 16, fontWeight: "700", borderBottomWidth: 1, borderBottomColor: G.border, paddingVertical: 4, paddingHorizontal: 8, minWidth: 120 },
  profileUsername: { color: "white", fontSize: 18, fontWeight: "800" },
  profileEmail:    { color: "rgba(200,180,255,0.55)", fontSize: 13 },

  // ── Lists & rows ──────────────────────────────────────────────────────────
  sectionTitle: { color: "#d8b4fe", fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 4 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: G.bgSubtle, borderRadius: 14, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: G.borderFaint,
  },
  historyIcon:  { fontSize: 18 },
  historyText:  { color: "white", fontSize: 13, fontWeight: "600" },
  historyTime:  { color: "rgba(200,180,255,0.50)", fontSize: 11, marginTop: 2 },
  emptyText:    { color: "rgba(168,85,247,0.45)", fontSize: 13, marginBottom: 16 },

  // ── Settings row ──────────────────────────────────────────────────────────
  settingRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: G.bgSubtle, borderRadius: 14, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: G.borderFaint,
  },
  settingToggle:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, minWidth: 58, alignItems: "center" },
  settingToggleOn:  { backgroundColor: "rgba(0,229,255,0.16)", borderWidth: 1, borderColor: "rgba(0,229,255,0.45)" },
  settingToggleOff: { backgroundColor: "rgba(168,85,247,0.10)", borderWidth: 1, borderColor: G.borderFaint },
  settingToggleText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  // ── Logout button ─────────────────────────────────────────────────────────
  logoutBtn: {
    marginTop: 24, paddingVertical: 14, borderRadius: 16,
    backgroundColor: "rgba(255,50,80,0.10)",
    borderWidth: 1, borderColor: "rgba(255,50,80,0.38)", alignItems: "center",
    shadowColor: "#ff4466", shadowOpacity: 0.28, shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  logoutText: { color: "#ff4466", fontWeight: "800", fontSize: 15 },

  // ── Small utility button ──────────────────────────────────────────────────
  smallBtn: {
    backgroundColor: "rgba(168,85,247,0.12)", paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, alignSelf: "center",
    borderWidth: 1, borderColor: G.border,
  },
  smallBtnText: { fontWeight: "800", fontSize: 13, color: "#fff" },

  // ── Modal overlay + box ───────────────────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: "rgba(3,1,10,0.88)", justifyContent: "center", alignItems: "center", padding: 18 },
  modalBox: {
    backgroundColor: G.bgDeep, borderRadius: 26, padding: 24,
    borderWidth: 1.5, borderColor: G.border,
    alignItems: "center", width: "100%", maxWidth: 360,
    shadowColor: G.shadow, shadowOpacity: 0.55, shadowRadius: 36,
    shadowOffset: { width: 0, height: 8 }, elevation: 22,
  },
  modalTitle:   { color: "white", fontSize: 18, fontWeight: "900", marginBottom: 6, textAlign: "center" },

  // ── Avatar picker ─────────────────────────────────────────────────────────
  avatarGrid:           { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  avatarOption:         { width: 56, height: 56, borderRadius: 14, backgroundColor: "rgba(168,85,247,0.08)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "transparent" },
  avatarOptionSelected: { borderColor: "#00e5ff", backgroundColor: "rgba(0,229,255,0.12)" },

  // ── Auth screen ───────────────────────────────────────────────────────────
  authContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, backgroundColor: "#05020E", gap: 14 },
  authTitle:     { color: "white", fontSize: 42, fontWeight: "900", letterSpacing: 2 },
  authSub:       { color: "rgba(200,180,255,0.60)", fontSize: 15, marginBottom: 8 },
  authInput: {
    width: "100%", backgroundColor: G.bgSubtle, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 18, color: "white", fontSize: 15,
    borderWidth: 1, borderColor: G.borderFaint,
  },
  authError:   { color: "#ff4466", fontSize: 13, textAlign: "center" },
  authSuccess: { color: "#00e5ff", fontSize: 13, textAlign: "center" },
  authBtn: {
    width: "100%",
    backgroundColor: "rgba(168, 85, 247, 0.20)",
    borderWidth: 1.5, borderColor: G.borderViv,
    paddingVertical: 15, borderRadius: 999, alignItems: "center", marginTop: 6,
    shadowColor: G.shadow, shadowOpacity: 0.50, shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  authBtnText: { fontWeight: "900", fontSize: 16, letterSpacing: 1, color: "#fff" },
  authToggle:  { color: "rgba(168,85,247,0.70)", fontSize: 13, marginTop: 4, textDecorationLine: "underline" },

  // ── Nav bar — glass with purple top border ────────────────────────────────
  nav: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: NAV_HEIGHT,
    paddingBottom: 10, paddingTop: 8, paddingHorizontal: 6,
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    backgroundColor: "rgba(7, 3, 16, 0.97)",
    borderTopWidth: 1.5, borderTopColor: "rgba(168, 85, 247, 0.55)",
    shadowColor: "#a855f7", shadowOpacity: 0.35, shadowRadius: 14,
    shadowOffset: { width: 0, height: -5 }, elevation: 18,
    zIndex: 50,
  },
  navItem:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 16, opacity: 0.62 },
  navItemActive: { backgroundColor: "rgba(168,85,247,0.20)", borderWidth: 1, borderColor: "rgba(168,85,247,0.52)", opacity: 1,
                   shadowColor: "#a855f7", shadowOpacity: 0.30, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  navIcon:       { width: 30, height: 30, resizeMode: "contain", tintColor: "#d8b4fe" },
  navText:       { color: "rgba(190,165,255,0.80)", fontSize: 9, fontWeight: "700", letterSpacing: 0.2 },
  navTextActive: { color: "#d8b4fe", fontWeight: "800" },

  // ── Daily / choice buttons ────────────────────────────────────────────────
  choiceBtn: {
    width: "100%", paddingVertical: 14, borderRadius: 16,
    borderWidth: 1, borderColor: G.borderFaint, alignItems: "center",
    backgroundColor: G.bgSubtle,
  },
  choiceBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  resultRow: {
    width: "100%", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: G.bgSubtle, borderWidth: 1, borderColor: G.borderFaint,
    flexDirection: "row", justifyContent: "space-between",
  },
  resultLabel: { fontWeight: "900" },
  resultValue: { color: "#fff", fontWeight: "900" },

  // ── Map mode pill ─────────────────────────────────────────────────────────
  mapModePill: {
    position: "absolute", left: 12, bottom: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 16, backgroundColor: G.bg,
    borderWidth: 1, borderColor: G.border,
    shadowColor: G.shadow, shadowOpacity: 0.28, shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 }, elevation: 8,
  },
  mapModeTitle: { color: "#d8b4fe", fontWeight: "900", fontSize: 13 },
  mapModeSub:   { color: "rgba(200,180,255,0.55)", marginTop: 2, fontSize: 11 },

  // ── Venue business — Manage Boosts button in AccountScreen ────────────────
  boostMgrBtn: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.45)",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#A855F7",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  boostMgrTitle: {
    color: "#d8b4fe",
    fontSize: 15,
    fontWeight: "900",
  },
  boostMgrSub: {
    color: "rgba(168,85,247,0.55)",
    fontSize: 12,
    marginTop: 2,
  },
});