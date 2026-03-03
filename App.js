import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import * as Location from "expo-location";
import { supabase } from "./lib/supabase";

if (Platform.OS === "web") {
  require("mapbox-gl/dist/mapbox-gl.css");
}

const AUTO_PULSE_EVERY_MS = 90_000;
const PULSE_TTL_MINUTES = 30;
const MANUAL_COOLDOWN_SECONDS = 60;

const VENUE_RADIUS_METERS = 1500;
const VENUE_MAX = 80;

const BPM_WINDOW_MINUTES = 10;
const MS_PER_MIN = 60_000;

const MAP_MAX_PULSE_POINTS = 300;
const MAP_MAX_VENUE_POINTS = 120;

// Zoom thresholds (hysteresis to prevent flicker)
const ZOOM_ANIMATE_ON = 14.5;
const ZOOM_ANIMATE_OFF = 14.0;
const MAX_ANIMATED = 40;

const PRESET_AVATARS = [
  { id: "a1", emoji: "🦊" },
  { id: "a2", emoji: "🐺" },
  { id: "a3", emoji: "🐸" },
  { id: "a4", emoji: "🐼" },
  { id: "a5", emoji: "🦁" },
  { id: "a6", emoji: "🐯" },
  { id: "a7", emoji: "🐨" },
  { id: "a8", emoji: "🦋" },
  { id: "a9", emoji: "🐙" },
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
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic per-venue randomness
// ─────────────────────────────────────────────────────────────────────────────
const seededRand = (id, salt = 0) => {
  let h = salt;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
};

const getVenueMotionParams = (venueId) => ({
  phaseOffset: seededRand(venueId, 1) * 700,
  amplitude: 6 + seededRand(venueId, 2) * 4,
  duration: 1900 + seededRand(venueId, 3) * 700,
  rotAmplitude: 1 + seededRand(venueId, 4) * 1.5,
  scaleAmplitude: 0.01 + seededRand(venueId, 5) * 0.01,
});

// ─────────────────────────────────────────────────────────────────────────────
// SVG icons
// ─────────────────────────────────────────────────────────────────────────────
const BEER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40">
  <defs>
    <linearGradient id="b-body" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffe066"/>
      <stop offset="55%" stop-color="#ffb300"/>
      <stop offset="100%" stop-color="#e65c00"/>
    </linearGradient>
    <linearGradient id="b-shine" x1="0%" y1="0%" x2="80%" y2="0%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="b-foam" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fff"/>
      <stop offset="100%" stop-color="#f0e0c0"/>
    </linearGradient>
  </defs>
  <rect x="11" y="23" width="32" height="32" rx="5" fill="url(#b-body)"/>
  <rect x="11" y="23" width="11" height="32" rx="5" fill="url(#b-shine)"/>
  <path d="M43 29 Q56 29 56 39 Q56 49 43 49" stroke="#e65c00" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M43 29 Q52 29 52 39 Q52 49 43 49" stroke="#ffb300" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="27" cy="23" rx="16" ry="6.5" fill="url(#b-foam)"/>
  <ellipse cx="17" cy="21" rx="7" ry="5" fill="#fff"/>
  <ellipse cx="27" cy="19" rx="8" ry="5.5" fill="#fff"/>
  <ellipse cx="37" cy="21" rx="6" ry="4.5" fill="#f5f0e8"/>
  <circle cx="20" cy="38" r="2.2" fill="#ffe066" opacity="0.55"/>
  <circle cx="30" cy="44" r="1.8" fill="#ffe066" opacity="0.45"/>
  <circle cx="25" cy="31" r="1.3" fill="#ffe066" opacity="0.45"/>
</svg>`;

const COCKTAIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40">
  <defs>
    <linearGradient id="c-glass" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b388ff" stop-opacity="0.88"/>
      <stop offset="55%" stop-color="#7c3aed" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#4a148c"/>
    </linearGradient>
    <linearGradient id="c-shine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="c-liquid" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff80ab"/>
      <stop offset="100%" stop-color="#e040fb"/>
    </linearGradient>
  </defs>
  <path d="M10 10 L32 40 L54 10 Z" fill="url(#c-glass)"/>
  <path d="M18 22 L32 40 L46 22 Z" fill="url(#c-liquid)" opacity="0.82"/>
  <path d="M10 10 L19 10 L32 40 Z" fill="url(#c-shine)"/>
  <line x1="32" y1="40" x2="32" y2="53" stroke="#b388ff" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="32" cy="54" rx="12" ry="3.5" fill="#7c3aed"/>
  <ellipse cx="32" cy="53" rx="9" ry="2" fill="#b388ff" opacity="0.45"/>
  <line x1="38" y1="8" x2="50" y2="14" stroke="#a5d6a7" stroke-width="2" stroke-linecap="round"/>
  <circle cx="50" cy="14" r="4" fill="#43a047"/>
  <circle cx="50" cy="14" r="2" fill="#e53935"/>
  <circle cx="22" cy="17" r="1.4" fill="#fff" opacity="0.65"/>
  <circle cx="39" cy="15" r="1" fill="#fff" opacity="0.55"/>
</svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// Marker CSS + animation (IMPORTANT: DO NOT transform the marker root)
// ─────────────────────────────────────────────────────────────────────────────
const MARKER_STYLES_ID = "pulse-premium-marker-styles";

const injectMarkerStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(MARKER_STYLES_ID)) return;

  const style = document.createElement("style");
  style.id = MARKER_STYLES_ID;
  style.textContent = `
    /* Root passed to Mapbox Marker. Never transform this. */
    .pm-outer{
      position: relative;
      width: 40px;
      height: 40px;
      pointer-events: auto;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
    }

    /* Safe to animate */
    .pm-wrap{
      position: relative;
      width: 40px;
      height: 40px;
      transform-origin: center bottom;
      will-change: transform;
    }

    .pm-icon{
      position: absolute;
      top: 0; left: 0;
      width: 40px; height: 40px;
      will-change: transform;
      transform-origin: center bottom;
      filter: drop-shadow(0px 6px 8px rgba(0,0,0,0.55));
    }

    .pm-shadow{
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 24px;
      height: 6px;
      background: rgba(0,0,0,0.35);
      border-radius: 50%;
      will-change: transform, opacity;
      transform-origin: center center;
      filter: blur(2px);
    }

    .pm-wrap.pressed .pm-icon{
      transform: translateY(-2px) scale(1.06);
      transition: transform 110ms ease-out;
    }

    @media (prefers-reduced-motion: reduce){
      .pm-wrap, .pm-icon{ animation: none !important; }
    }
  `;
  document.head.appendChild(style);
};

const startMarkerAnimation = (wrapEl, venueId, getAnimating) => {
  const iconEl = wrapEl.querySelector(".pm-icon");
  const shadowEl = wrapEl.querySelector(".pm-shadow");
  if (!iconEl || !shadowEl) return () => {};

  const params = getVenueMotionParams(venueId);
  let rafId = null;
  let transitionProgress = 0;
  let lastTimestamp = null;
  const TRANSITION_MS = 280;

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const tick = (ts) => {
    rafId = requestAnimationFrame(tick);

    const dt = lastTimestamp ? Math.min(ts - lastTimestamp, 50) : 16;
    lastTimestamp = ts;

    const shouldAnimate = !!getAnimating();

    if (shouldAnimate && !prefersReduced) {
      transitionProgress = Math.min(1, transitionProgress + dt / TRANSITION_MS);
    } else {
      transitionProgress = Math.max(0, transitionProgress - dt / TRANSITION_MS);
    }

    if (transitionProgress === 0) {
      iconEl.style.transform = "translateY(0px) rotateZ(0deg) scale(1)";
      shadowEl.style.transform = "translateX(-50%) scaleX(1)";
      shadowEl.style.opacity = "1";
      return;
    }

    const t = (ts + params.phaseOffset) / params.duration;
    const sine = Math.sin(t * Math.PI * 2);

    const amp = params.amplitude * transitionProgress;
    const rAmp = params.rotAmplitude * transitionProgress;
    const sAmp = params.scaleAmplitude * transitionProgress;

    const translateY = -amp * ((sine + 1) / 2);
    const rotateZ = rAmp * sine;
    const scale = 1 + sAmp * ((sine + 1) / 2);

    iconEl.style.transform = `translateY(${translateY.toFixed(
      2
    )}px) rotateZ(${rotateZ.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

    const liftFraction = Math.min(
      1,
      Math.abs(translateY) / Math.max(1, params.amplitude)
    );
    const shadowScale = 1 - liftFraction * 0.35;
    const shadowOpacity = 1 - liftFraction * 0.4;
    shadowEl.style.transform = `translateX(-50%) scaleX(${shadowScale.toFixed(
      3
    )})`;
    shadowEl.style.opacity = shadowOpacity.toFixed(3);
  };

  rafId = requestAnimationFrame(tick);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
};

const createVenueMarkerEl = (venue, getAnimating, onClick) => {
  injectMarkerStyles();

  const isPub = venue.kind === "pub";
  const svg = isPub ? BEER_SVG : COCKTAIL_SVG;

  const outer = document.createElement("div");
  outer.className = "pm-outer";

  const wrap = document.createElement("div");
  wrap.className = "pm-wrap";

  const icon = document.createElement("div");
  icon.className = "pm-icon";
  icon.innerHTML = svg;

  const shadow = document.createElement("div");
  shadow.className = "pm-shadow";

  wrap.appendChild(shadow);
  wrap.appendChild(icon);
  outer.appendChild(wrap);

  const onDown = (e) => {
    try {
      e.stopPropagation();
    } catch {}
    wrap.classList.add("pressed");
  };
  const onUp = (e) => {
    try {
      e.stopPropagation();
    } catch {}
    wrap.classList.remove("pressed");
    onClick(venue);
  };

  outer.addEventListener("mousedown", onDown);
  outer.addEventListener("touchstart", onDown, { passive: true });
  outer.addEventListener("mouseup", onUp);
  outer.addEventListener("touchend", onUp);

  const stopAnim = startMarkerAnimation(wrap, venue.id, getAnimating);
  outer._stopAnim = stopAnim;

  return outer;
};

// ─────────────────────────────────────────────────────────────────────────────
// UI Screens
// ─────────────────────────────────────────────────────────────────────────────
const MapScreen = ({
  mapDivRef,
  status,
  pulses,
  venues,
  selectedVenue,
  setSelectedVenue,
  cooldownLeft,
  onPulseHere,
  uniqueUsersAtVenue,
  selectedVenuePulses,
  distanceToSelectedVenue,
  selectedVenueBpm,
}) => (
  <View style={{ flex: 1 }}>
    <div
      ref={mapDivRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "#000",
      }}
    />
    <View style={styles.topOverlay}>
      <Text style={styles.title}>Pulse</Text>
      <Pressable
        style={[styles.button, cooldownLeft > 0 && styles.buttonDisabled]}
        onPress={onPulseHere}
        disabled={cooldownLeft > 0}
      >
        <Text style={styles.buttonText}>
          {cooldownLeft > 0
            ? `WAIT ${cooldownLeft}s`
            : selectedVenue
            ? "PULSE HERE"
            : "PULSE"}
        </Text>
      </Pressable>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.status}>
        Pulses: {pulses.length} • Venues: {venues.length}
      </Text>
    </View>

    {selectedVenue && (
      <View style={styles.sheet}>
        <View style={styles.sheetRow}>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {selectedVenue.name}
          </Text>
          <Pressable onPress={() => setSelectedVenue(null)}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.sheetStats}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {distanceToSelectedVenue == null
                ? "…"
                : distanceToSelectedVenue < 1000
                ? `${Math.round(distanceToSelectedVenue)}m`
                : `${(distanceToSelectedVenue / 1000).toFixed(1)}km`}
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
            <Text style={[styles.statValue, { color: "#00e5ff" }]}>
              {selectedVenueBpm.toFixed(1)}
            </Text>
            <Text style={[styles.statLabel, { color: "#00e5ff" }]}>BPM</Text>
          </View>
        </View>
        <Text style={styles.sheetTiny}>
          {selectedVenue.kind?.toUpperCase()} • 1 pulse/min global cooldown ✅
        </Text>
      </View>
    )}
  </View>
);

const LeaderboardScreen = ({ leaderboard }) => (
  <View style={{ flex: 1, paddingTop: 56 }}>
    <View style={styles.leaderHeader}>
      <Text style={styles.leaderTitle}>Top Venues Right Now</Text>
      <Text style={styles.leaderSub}>
        BPM = pulses/min over last {BPM_WINDOW_MINUTES} mins
      </Text>
    </View>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 12, paddingBottom: 90 }}
    >
      {leaderboard.length === 0 ? (
        <Text style={{ color: "#bbb", textAlign: "center", marginTop: 18 }}>
          No venue pulses yet — go to the map, select a venue and hit PULSE HERE.
        </Text>
      ) : (
        leaderboard.map((row, idx) => (
          <View key={row.venueId} style={styles.leaderRow}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                flex: 1,
              }}
            >
              <Text style={styles.rank}>{idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.venueName} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={styles.venueMeta} numberOfLines={1}>
                  Going now: {row.goingNow}
                  {"  •  "}Pulses: {row.pulsesInWindow}
                  {"  •  "}Users: {row.uniqueUsersWindow}
                  {row.distanceM != null
                    ? `  •  ${(row.distanceM / 1000).toFixed(2)} km`
                    : ""}
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

const AccountScreen = ({
  session,
  profile,
  pulseHistory,
  onLogout,
  onSaveProfile,
  onDeleteFavourite,
}) => {
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(profile?.username || "");
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentAvatar =
    PRESET_AVATARS.find((a) => a.id === profile?.avatar_id) ||
    PRESET_AVATARS[0];

  const handleSaveUsername = async () => {
    setSaving(true);
    await onSaveProfile({
      username: newUsername,
      avatar_id: profile?.avatar_id,
      favourite_venues: profile?.favourite_venues || [],
    });
    setSaving(false);
    setEditingUsername(false);
  };

  const handlePickAvatar = async (id) => {
    setAvatarPicker(false);
    await onSaveProfile({
      username: profile?.username,
      avatar_id: id,
      favourite_venues: profile?.favourite_venues || [],
    });
  };

  return (
    <View style={{ flex: 1, paddingTop: 56 }}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 100 }}>
        <View style={styles.profileCard}>
          <Pressable
            style={styles.avatarCircle}
            onPress={() => setAvatarPicker(true)}
          >
            <Text style={styles.avatarEmoji}>{currentAvatar.emoji}</Text>
            <View style={styles.avatarEditBadge}>
              <Text style={{ fontSize: 10, color: "#fff" }}>✏️</Text>
            </View>
          </Pressable>

          {editingUsername ? (
            <View style={styles.usernameRow}>
              <TextInput
                style={styles.usernameInput}
                value={newUsername}
                onChangeText={setNewUsername}
                autoFocus
                maxLength={24}
                placeholder="Enter username"
                placeholderTextColor="#666"
              />
              <Pressable
                style={[styles.smallBtn, saving && styles.buttonDisabled]}
                onPress={handleSaveUsername}
                disabled={saving}
              >
                <Text style={styles.smallBtnText}>{saving ? "…" : "Save"}</Text>
              </Pressable>
              <Pressable
                style={[styles.smallBtn, { backgroundColor: "#333" }]}
                onPress={() => setEditingUsername(false)}
              >
                <Text style={[styles.smallBtnText, { color: "#fff" }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setNewUsername(profile?.username || "");
                setEditingUsername(true);
              }}
            >
              <Text style={styles.profileUsername}>
                {profile?.username || "Set a username"}{" "}
                <Text style={{ fontSize: 13, color: "#aaa" }}>✏️</Text>
              </Text>
            </Pressable>
          )}

          <Text style={styles.profileEmail}>{session?.user?.email}</Text>
        </View>

        <Modal visible={avatarPicker} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Pick Your Avatar</Text>
              <View style={styles.avatarGrid}>
                {PRESET_AVATARS.map((a) => (
                  <Pressable
                    key={a.id}
                    style={[
                      styles.avatarOption,
                      profile?.avatar_id === a.id &&
                        styles.avatarOptionSelected,
                    ]}
                    onPress={() => handlePickAvatar(a.id)}
                  >
                    <Text style={{ fontSize: 28 }}>{a.emoji}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.smallBtn, { marginTop: 14 }]}
                onPress={() => setAvatarPicker(false)}
              >
                <Text style={styles.smallBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Text style={styles.sectionTitle}>Recent Pulses</Text>
        {pulseHistory.length === 0 ? (
          <Text style={styles.emptyText}>No pulses yet.</Text>
        ) : (
          pulseHistory.slice(0, 20).map((p) => (
            <View key={p.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>
                {p.venueId ? "📍" : p.source === "manual" ? "⚡" : "🔄"}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyText}>
                  {p.venueName ||
                    (p.source === "manual" ? "Manual pulse" : "Auto pulse")}
                </Text>
                <Text style={styles.historyTime}>
                  {new Date(p.createdAt).toLocaleString()}
                </Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Favourite Venues</Text>
        {!profile?.favourite_venues || profile.favourite_venues.length === 0 ? (
          <Text style={styles.emptyText}>
            No favourites yet — pulse a venue to add it automatically.
          </Text>
        ) : (
          profile.favourite_venues.map((fav) => (
            <View key={fav.venueId} style={styles.historyRow}>
              <Text style={styles.historyIcon}>⭐</Text>
              <Text style={[styles.historyText, { flex: 1 }]}>{fav.name}</Text>
              <Pressable onPress={() => onDeleteFavourite(fav.venueId)}>
                <Text
                  style={{ color: "#ff4466", fontSize: 18, paddingHorizontal: 8 }}
                >
                  ✕
                </Text>
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

const AuthScreen = () => {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (mode === "signup" && !username) {
      setError("Please enter a username.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          username,
          avatar_id: "a1",
          favourite_venues: [],
        });
      }
      setSuccess("Account created! Check your email to confirm, then log in.");
      setMode("login");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
  };

  return (
    <View style={styles.authContainer}>
      <Text style={styles.authTitle}>Pulse</Text>
      <Text style={styles.authSub}>
        {mode === "login" ? "Welcome back" : "Create your account"}
      </Text>

      {mode === "signup" && (
        <TextInput
          style={styles.authInput}
          placeholder="Username"
          placeholderTextColor="#666"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          maxLength={24}
        />
      )}
      <TextInput
        style={styles.authInput}
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.authInput}
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {!!error && <Text style={styles.authError}>{error}</Text>}
      {!!success && <Text style={styles.authSuccess}>{success}</Text>}

      <Pressable
        style={[styles.authBtn, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.authBtnText}>
            {mode === "login" ? "Log In" : "Sign Up"}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
          setSuccess("");
        }}
      >
        <Text style={styles.authToggle}>
          {mode === "login"
            ? "Don't have an account? Sign Up"
            : "Already have an account? Log In"}
        </Text>
      </Pressable>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("map");

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [profile, setProfile] = useState(null);
  const [pulseHistory, setPulseHistory] = useState([]);

  const [status, setStatus] = useState("Booting…");
  const [location, setLocation] = useState(null);

  const [pulses, setPulses] = useState([]);
  const [venues, setVenues] = useState([]);

  const [selectedVenue, setSelectedVenue] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef(null);
  const mapboxglRef = useRef(null);
  const mapDivRef = useRef(null);

  const timerRef = useRef(null);
  const venuesRef = useRef([]);
  const markersRef = useRef([]); // [{ marker, el, venueId }]

  const animatingRef = useRef(false);
  const animatedSetRef = useRef(new Set());

  // NEW: pause animations while the user is interacting (zoom/drag/pinch)
  const interactingRef = useRef(false);
  const interactTimerRef = useRef(null);

  useEffect(() => {
    venuesRef.current = venues;
  }, [venues]);

  const ttlExpiresAtISO = () =>
    new Date(Date.now() + PULSE_TTL_MINUTES * 60 * 1000).toISOString();

  const getOneLocationFix = async () => {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) =>
        setProfile(
          data || {
            id: session.user.id,
            username: "",
            avatar_id: "a1",
            favourite_venues: [],
          }
        )
      );
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || tab !== "account") return;

    supabase
      .from("pulses")
      .select("id, created_at, source, venue_id, latitude, longitude")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!data) return;
        const vm = new Map(venuesRef.current.map((v) => [v.id, v.name]));
        setPulseHistory(
          data.map((p) => ({
            id: p.id,
            createdAt: p.created_at,
            source: p.source,
            venueId: p.venue_id,
            venueName: p.venue_id ? vm.get(p.venue_id) || "Unknown venue" : null,
            latitude: p.latitude,
            longitude: p.longitude,
          }))
        );
      });
  }, [session?.user?.id, tab]);

  const onSaveProfile = async (updates) => {
    if (!session?.user) return;
    const { data } = await supabase
      .from("profiles")
      .upsert({ id: session.user.id, ...updates })
      .select()
      .single();
    if (data) setProfile(data);
  };

  const onDeleteFavourite = async (venueId) => {
    if (!profile) return;
    const updated = (profile.favourite_venues || []).filter(
      (f) => f.venueId !== venueId
    );
    await onSaveProfile({
      username: profile.username,
      avatar_id: profile.avatar_id,
      favourite_venues: updated,
    });
  };

  const addFavouriteVenue = async (venue) => {
    if (!profile || !venue) return;
    const existing = profile.favourite_venues || [];
    if (existing.some((f) => f.venueId === venue.id)) return;

    await onSaveProfile({
      username: profile.username,
      avatar_id: profile.avatar_id,
      favourite_venues: [...existing, { venueId: venue.id, name: venue.name }],
    });
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    setTab("map");
  };

  // ── Cooldown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(
      () => setCooldownLeft((s) => Math.max(0, s - 1)),
      1000
    );
    return () => clearInterval(t);
  }, [cooldownLeft]);

  // ── Pulses ────────────────────────────────────────────────────────────────
  const addPulseToDb = async ({ lat, lon, source, venueId }) => {
    const { error } = await supabase.from("pulses").insert([
      {
        latitude: lat,
        longitude: lon,
        expires_at: ttlExpiresAtISO(),
        source,
        venue_id: venueId ?? null,
        user_id: session?.user?.id ?? null,
        minute_bucket: venueId ? new Date().toISOString().slice(0, 16) : null,
      },
    ]);

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        setStatus("Too fast — wait a moment.");
        return;
      }
      setStatus(`Insert error: ${error.message}`);
    }
  };

  const loadPulses = async () => {
    const { data, error } = await supabase
      .from("pulses")
      .select(
        "id, latitude, longitude, created_at, expires_at, source, venue_id, user_id"
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      setStatus(`Load error: ${error.message}`);
      return;
    }
    setPulses(
      (data || []).map((p) => ({
        id: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        createdAt: p.created_at,
        expiresAt: p.expires_at,
        source: p.source,
        venueId: p.venue_id,
        userId: p.user_id,
      }))
    );
  };

  useEffect(() => {
    loadPulses();
    const ch = supabase
      .channel("pulses-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pulses" },
        (payload) => {
          const p = payload.new;
          if (new Date(p.expires_at).getTime() <= Date.now()) return;
          setPulses((prev) => [
            {
              id: p.id,
              latitude: p.latitude,
              longitude: p.longitude,
              createdAt: p.created_at,
              expiresAt: p.expires_at,
              source: p.source,
              venueId: p.venue_id,
              userId: p.user_id,
            },
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  // ── Location + auto pulse ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        setStatus("Requesting location permission…");
        const { status: perm } =
          await Location.requestForegroundPermissionsAsync();
        if (perm !== "granted") {
          setStatus("Location permission denied");
          return;
        }

        setStatus("Getting location…");
        const fix = await getOneLocationFix();
        if (!mounted) return;

        setLocation(fix);
        setStatus("Live ✅");

        await addPulseToDb({
          lat: fix.latitude,
          lon: fix.longitude,
          source: "auto",
          venueId: null,
        });

        timerRef.current = setInterval(async () => {
          try {
            const f = await getOneLocationFix();
            setLocation(f);
            await addPulseToDb({
              lat: f.latitude,
              lon: f.longitude,
              source: "auto",
              venueId: null,
            });
          } catch {}
        }, AUTO_PULSE_EVERY_MS);
      } catch (e) {
        setStatus(`Error: ${String(e?.message || e)}`);
      }
    };

    if (session?.user) start();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.user?.id]);

  // ── OSM venues ────────────────────────────────────────────────────────────
  const fetchVenuesOverpass = async (lat, lon) => {
    const query = `[out:json][timeout:25];(
      node(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"];
      way(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"];
      relation(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"];
    );out center ${VENUE_MAX};`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: query,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);

    const json = await res.json();
    const seen = new Set();
    const deduped = [];

    for (const e of json.elements || []) {
      const name = e.tags?.name || e.tags?.["name:en"] || null;
      const type = e.tags?.amenity || null;

      const vLat = e.lat ?? e.center?.lat;
      const vLon = e.lon ?? e.center?.lon;

      const latN = Number(vLat);
      const lonN = Number(vLon);
      if (!Number.isFinite(latN) || !Number.isFinite(lonN)) continue;

      const key = `${name}-${latN.toFixed(5)}-${lonN.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      deduped.push({
        id: `${e.type}-${e.id}`,
        name: name || (type?.toUpperCase() || "VENUE"),
        kind: type || "venue",
        latitude: latN,
        longitude: lonN,
      });
    }

    return deduped.slice(0, VENUE_MAX);
  };

  useEffect(() => {
    if (!location) return;

    let alive = true;
    const t = setTimeout(async () => {
      try {
        setStatus((p) => `${p.split("| Venues:")[0].trim()} | Venues: loading…`);
        const v = await fetchVenuesOverpass(location.latitude, location.longitude);
        if (!alive) return;
        setVenues(v);
        setStatus((p) => `${p.split("| Venues:")[0].trim()} | Venues: ${v.length}`);
      } catch {
        setStatus((p) => `${p.split("| Venues:")[0].trim()} | Venues: error`);
      }
    }, 700);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [location?.latitude, location?.longitude]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedVenuePulses = useMemo(() => {
    if (!selectedVenue) return [];
    const now = Date.now();
    return pulses.filter(
      (p) =>
        p.venueId === selectedVenue.id && new Date(p.expiresAt).getTime() > now
    );
  }, [pulses, selectedVenue]);

  const uniqueUsersAtVenue = useMemo(() => {
    const s = new Set();
    selectedVenuePulses.forEach((p) => {
      if (p.userId) s.add(p.userId);
    });
    return Array.from(s);
  }, [selectedVenuePulses]);

  const distanceToSelectedVenue = useMemo(() => {
    if (!selectedVenue || !location) return null;
    return haversineMeters(
      location.latitude,
      location.longitude,
      selectedVenue.latitude,
      selectedVenue.longitude
    );
  }, [selectedVenue, location]);

  const selectedVenueBpm = useMemo(() => {
    if (!selectedVenue) return 0;
    const windowStart = Date.now() - BPM_WINDOW_MINUTES * MS_PER_MIN;

    const count = pulses.filter((p) => {
      if (p.venueId !== selectedVenue.id) return false;
      const c = new Date(p.createdAt).getTime();
      return Number.isFinite(c) && c >= windowStart;
    }).length;

    return count / BPM_WINDOW_MINUTES;
  }, [pulses, selectedVenue]);

  const leaderboard = useMemo(() => {
    const now = Date.now();
    const windowStart = now - BPM_WINDOW_MINUTES * MS_PER_MIN;

    const activeNow = new Map();
    pulses.forEach((p) => {
      if (!p.venueId || !p.userId) return;
      if (new Date(p.expiresAt).getTime() <= now) return;
      if (!activeNow.has(p.venueId)) activeNow.set(p.venueId, new Set());
      activeNow.get(p.venueId).add(p.userId);
    });

    const agg = new Map();
    pulses.forEach((p) => {
      if (!p.venueId) return;
      const c = new Date(p.createdAt).getTime();
      if (!Number.isFinite(c) || c < windowStart) return;

      if (!agg.has(p.venueId))
        agg.set(p.venueId, { pulsesInWindow: 0, usersInWindow: new Set() });

      const a = agg.get(p.venueId);
      a.pulsesInWindow++;
      if (p.userId) a.usersInWindow.add(p.userId);
    });

    const venueById = new Map(venuesRef.current.map((v) => [v.id, v]));
    const rows = [];

    for (const [venueId, a] of agg.entries()) {
      const v = venueById.get(venueId);
      if (!v) continue;
      rows.push({
        venueId,
        name: v.name,
        kind: v.kind,
        bpm: a.pulsesInWindow / BPM_WINDOW_MINUTES,
        goingNow: activeNow.get(venueId)?.size ?? 0,
        pulsesInWindow: a.pulsesInWindow,
        uniqueUsersWindow: a.usersInWindow.size,
        distanceM: location
          ? haversineMeters(
              location.latitude,
              location.longitude,
              v.latitude,
              v.longitude
            )
          : null,
      });
    }

    rows.sort((x, y) =>
      y.bpm !== x.bpm ? y.bpm - x.bpm : y.goingNow - x.goingNow
    );
    return rows.slice(0, 30);
  }, [pulses, venues, location]);

  // ── GeoJSON (pulse dots only) ─────────────────────────────────────────────
  const pulsesGeoJSON = useMemo(() => {
    const now = Date.now();
    return {
      type: "FeatureCollection",
      features: pulses
        .filter((p) => new Date(p.expiresAt).getTime() > now)
        .slice(0, MAP_MAX_PULSE_POINTS)
        .map((p) => {
          const lat = Number(p.latitude);
          const lon = Number(p.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
              id: String(p.id),
              source: p.source || "auto",
              hasVenue: !!p.venueId,
            },
          };
        })
        .filter(Boolean),
    };
  }, [pulses]);

  // ── Mapbox init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") return;

    let cancelled = false;

    const init = async () => {
      const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        setStatus("Missing EXPO_PUBLIC_MAPBOX_TOKEN");
        return;
      }
      if (!mapDivRef.current || mapRef.current) return;

      const mod = await import("mapbox-gl");
      const mapboxgl = mod.default ?? mod;
      mapboxglRef.current = mapboxgl;

      if (typeof mapboxgl.supported === "function" && !mapboxgl.supported()) {
        setStatus("WebGL not supported.");
        return;
      }

      mapboxgl.accessToken = token;

      const center = location
        ? [location.longitude, location.latitude]
        : [-6.2603, 53.3498];

      const map = new mapboxgl.Map({
        container: mapDivRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center,
        zoom: 14,
        attributionControl: false,
      });

      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("error", (e) => console.log("MAPBOX:", e?.error || e));

      const updateAnimatingFlag = () => {
        const z = map.getZoom();
        if (!animatingRef.current && z >= ZOOM_ANIMATE_ON) {
          animatingRef.current = true;
        } else if (animatingRef.current && z <= ZOOM_ANIMATE_OFF) {
          animatingRef.current = false;
        }
      };

      const recomputeAnimatedSet = () => {
        if (!animatingRef.current) {
          animatedSetRef.current = new Set();
          return;
        }
        const c = map.getCenter();
        const list = venuesRef.current
          .map((v) => {
            const la = Number(v.latitude);
            const lo = Number(v.longitude);
            if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
            return { id: v.id, d: haversineMeters(c.lat, c.lng, la, lo) };
          })
          .filter(Boolean)
          .sort((a, b) => a.d - b.d)
          .slice(0, MAX_ANIMATED);

        animatedSetRef.current = new Set(list.map((x) => x.id));
      };

      // NEW: freeze animation while interacting
      const setInteracting = (v) => {
        interactingRef.current = v;
        if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
      };

      map.on("movestart", () => setInteracting(true));
      map.on("zoomstart", () => setInteracting(true));
      map.on("dragstart", () => setInteracting(true));

      const endInteraction = () => {
        if (interactTimerRef.current) clearTimeout(interactTimerRef.current);
        interactTimerRef.current = setTimeout(() => {
          interactingRef.current = false;
        }, 140);
      };

      map.on("moveend", endInteraction);
      map.on("zoomend", endInteraction);
      map.on("dragend", endInteraction);

      map.on("zoom", () => {
        updateAnimatingFlag();
      });

      map.on("zoomend", () => {
        updateAnimatingFlag();
        recomputeAnimatedSet();
      });

      map.on("moveend", () => {
        recomputeAnimatedSet();
      });

      map.on("load", () => {
        if (cancelled) return;

        updateAnimatingFlag();
        recomputeAnimatedSet();

        map.addSource("pulses", { type: "geojson", data: pulsesGeoJSON });
        map.addLayer({
          id: "pulses-layer",
          type: "circle",
          source: "pulses",
          paint: {
            "circle-radius": 6,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#000",
            "circle-blur": 0.4,
            "circle-color": [
              "case",
              ["==", ["get", "hasVenue"], true],
              "#ffd166",
              ["==", ["get", "source"], "manual"],
              "#ffffff",
              "#00e5ff",
            ],
          },
        });

        setMapReady(true);
        setTimeout(() => {
          try {
            map.resize();
          } catch {}
        }, 150);
      });
    };

    const t = setTimeout(init, 100);

    return () => {
      cancelled = true;
      clearTimeout(t);

      if (interactTimerRef.current) clearTimeout(interactTimerRef.current);

      markersRef.current.forEach(({ el, marker }) => {
        if (el?._stopAnim) el._stopAnim();
        try {
          marker.remove();
        } catch {}
      });
      markersRef.current = [];

      try {
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        setMapReady(false);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update pulse GeoJSON ──────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !mapReady) return;
    try {
      const s = mapRef.current?.getSource("pulses");
      if (s?.setData) s.setData(pulsesGeoJSON);
    } catch {}
  }, [pulsesGeoJSON, mapReady]);

  // ── Rebuild venue markers ─────────────────────────────────────────────────
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      !mapReady ||
      !mapRef.current ||
      !mapboxglRef.current
    )
      return;

    const mapboxgl = mapboxglRef.current;

    markersRef.current.forEach(({ el, marker }) => {
      if (el?._stopAnim) el._stopAnim();
      try {
        marker.remove();
      } catch {}
    });
    markersRef.current = [];

    const venuesToRender = venues.slice(0, MAP_MAX_VENUE_POINTS);

    venuesToRender.forEach((venue) => {
      const lat = Number(venue.latitude);
      const lon = Number(venue.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      // Most likely fix: stop animation while map is being manipulated,
      // and only animate a limited set near center when zoomed in.
      const getAnimating = () =>
        !interactingRef.current &&
        animatingRef.current &&
        animatedSetRef.current.has(venue.id);

      const el = createVenueMarkerEl(venue, getAnimating, (v) =>
        setSelectedVenue(v)
      );

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
        offset: [0, 0],
      })
        .setLngLat([lon, lat])
        .addTo(mapRef.current);

      markersRef.current.push({ marker, el, venueId: venue.id });
    });

    // refresh allowed animated set after rebuild
    try {
      const map = mapRef.current;
      if (map) {
        const z = map.getZoom();
        if (!animatingRef.current && z >= ZOOM_ANIMATE_ON)
          animatingRef.current = true;
        if (animatingRef.current && z <= ZOOM_ANIMATE_OFF)
          animatingRef.current = false;

        const c = map.getCenter();
        const list = venuesRef.current
          .map((v) => {
            const la = Number(v.latitude);
            const lo = Number(v.longitude);
            if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
            return { id: v.id, d: haversineMeters(c.lat, c.lng, la, lo) };
          })
          .filter(Boolean)
          .sort((a, b) => a.d - b.d)
          .slice(0, MAX_ANIMATED);
        animatedSetRef.current = new Set(list.map((x) => x.id));
      }
    } catch {}
  }, [venues, mapReady]);

  // ── Centre map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || !mapReady || !mapRef.current || !location)
      return;
    try {
      mapRef.current.easeTo({
        center: [location.longitude, location.latitude],
        duration: 700,
      });
    } catch {}
  }, [location, mapReady]);

  // ── Resize on tab switch ──────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web" || tab !== "map" || !mapReady || !mapRef.current)
      return;
    setTimeout(() => {
      try {
        mapRef.current.resize();
      } catch {}
    }, 50);
  }, [tab, mapReady]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const onPulseHere = async () => {
    try {
      if (cooldownLeft > 0) {
        setStatus(`Wait ${cooldownLeft}s before pulsing again.`);
        return;
      }
      const fix = location ?? (await getOneLocationFix());
      setLocation(fix);

      await addPulseToDb({
        lat: fix.latitude,
        lon: fix.longitude,
        source: "manual",
        venueId: selectedVenue?.id ?? null,
      });

      setCooldownLeft(MANUAL_COOLDOWN_SECONDS);
      if (selectedVenue) addFavouriteVenue(selectedVenue);
    } catch (e) {
      setStatus(`Pulse error: ${String(e?.message || e)}`);
    }
  };

  const userAvatar =
    PRESET_AVATARS.find((a) => a.id === profile?.avatar_id) ||
    PRESET_AVATARS[0];

  if (authLoading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  if (!session) return <AuthScreen />;

  const BottomNav = () => (
    <View style={styles.nav}>
      <Pressable
        style={[styles.navItem, tab === "map" && styles.navItemActive]}
        onPress={() => setTab("map")}
      >
        <Text style={[styles.navIcon, tab === "map" && styles.navIconActive]}>
          🗺️
        </Text>
        <Text style={[styles.navText, tab === "map" && styles.navTextActive]}>
          Map
        </Text>
      </Pressable>

      <Pressable
        style={styles.navCenter}
        onPress={() => {
          if (tab !== "map") setTab("map");
          onPulseHere();
        }}
      >
        <Text style={styles.navCenterText}>⚡</Text>
      </Pressable>

      <Pressable
        style={[styles.navItem, tab === "events" && styles.navItemActive]}
        onPress={() => {
          setSelectedVenue(null);
          setTab("events");
        }}
      >
        <Text style={[styles.navIcon, tab === "events" && styles.navIconActive]}>
          📅
        </Text>
        <Text style={[styles.navText, tab === "events" && styles.navTextActive]}>
          Planner
        </Text>
      </Pressable>

      <Pressable
        style={[styles.navItem, tab === "account" && styles.navItemActive]}
        onPress={() => setTab("account")}
      >
        <Text
          style={[styles.navIcon, tab === "account" && styles.navIconActive]}
        >
          {userAvatar.emoji}
        </Text>
        <Text
          style={[styles.navText, tab === "account" && styles.navTextActive]}
        >
          {profile?.username ? profile.username.slice(0, 8) : "Account"}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, position: "relative" }}>
        <MapScreen
          mapDivRef={mapDivRef}
          status={status}
          pulses={pulses}
          venues={venues}
          selectedVenue={selectedVenue}
          setSelectedVenue={setSelectedVenue}
          cooldownLeft={cooldownLeft}
          onPulseHere={onPulseHere}
          uniqueUsersAtVenue={uniqueUsersAtVenue}
          selectedVenuePulses={selectedVenuePulses}
          distanceToSelectedVenue={distanceToSelectedVenue}
          selectedVenueBpm={selectedVenueBpm}
        />

        <View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: tab === "events" ? 1 : 0,
              pointerEvents: tab === "events" ? "auto" : "none",
              zIndex: 5,
              backgroundColor: "#000",
            },
          ]}
        >
          <LeaderboardScreen leaderboard={leaderboard} />
        </View>

        <View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: tab === "account" ? 1 : 0,
              pointerEvents: tab === "account" ? "auto" : "none",
              zIndex: 5,
              backgroundColor: "#000",
            },
          ]}
        >
          <AccountScreen
            session={session}
            profile={profile}
            pulseHistory={pulseHistory}
            onLogout={onLogout}
            onSaveProfile={onSaveProfile}
            onDeleteFavourite={onDeleteFavourite}
          />
        </View>
      </View>

      <BottomNav />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles (unchanged from your previous block)
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topOverlay: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    alignItems: "center",
    gap: 10,
    zIndex: 2,
  },
  title: { color: "white", fontSize: 28, fontWeight: "700" },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: "white",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  status: { color: "#ccc", fontSize: 12, textAlign: "center" },

  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 90,
    backgroundColor: "rgba(10,10,10,0.95)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 14,
    gap: 10,
    zIndex: 2,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sheetTitle: { color: "white", fontSize: 17, fontWeight: "800", flex: 1 },
  close: { color: "white", fontSize: 18, paddingHorizontal: 8, paddingVertical: 2 },
  sheetStats: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statBoxHighlight: {
    borderColor: "rgba(0,229,255,0.3)",
    backgroundColor: "rgba(0,229,255,0.07)",
  },
  statValue: { color: "white", fontSize: 17, fontWeight: "900" },
  statLabel: { color: "#aaa", fontSize: 10, marginTop: 2 },
  sheetTiny: { color: "#777", fontSize: 11 },

  leaderHeader: { paddingHorizontal: 14, paddingBottom: 10 },
  leaderTitle: { color: "white", fontSize: 20, fontWeight: "900" },
  leaderSub: { color: "#bbb", marginTop: 4, fontSize: 12 },

  leaderRow: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  rank: { color: "#fff", fontWeight: "900", width: 22, textAlign: "center" },
  venueName: { color: "white", fontSize: 14, fontWeight: "800" },
  venueMeta: { color: "#bbb", fontSize: 11, marginTop: 2 },

  bpmPill: {
    backgroundColor: "rgba(0,229,255,0.14)",
    borderColor: "rgba(0,229,255,0.25)",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    minWidth: 74,
  },
  bpmValue: { color: "white", fontWeight: "900", fontSize: 16, lineHeight: 18 },
  bpmLabel: { color: "#cfefff", fontSize: 10, marginTop: 2 },

  profileCard: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 24,
    gap: 8,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.15)",
  },
  avatarEmoji: { fontSize: 40 },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#333",
    borderRadius: 999,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  usernameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  usernameInput: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "#555",
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 120,
  },
  profileUsername: { color: "white", fontSize: 18, fontWeight: "800" },
  profileEmail: { color: "#888", fontSize: 13 },

  sectionTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 4,
  },

  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  historyIcon: { fontSize: 18 },
  historyText: { color: "white", fontSize: 13, fontWeight: "600" },
  historyTime: { color: "#888", fontSize: 11, marginTop: 2 },
  emptyText: { color: "#666", fontSize: 13, marginBottom: 16 },

  logoutBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,50,80,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,50,80,0.3)",
    alignItems: "center",
  },
  logoutText: { color: "#ff4466", fontWeight: "800", fontSize: 15 },

  smallBtn: {
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  smallBtnText: { fontWeight: "800", fontSize: 13 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#111",
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    width: 320,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 16,
  },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  avatarOption: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  avatarOptionSelected: {
    borderColor: "#00e5ff",
    backgroundColor: "rgba(0,229,255,0.12)",
  },

  authContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    backgroundColor: "#000",
    gap: 14,
  },
  authTitle: { color: "white", fontSize: 42, fontWeight: "900", letterSpacing: 2 },
  authSub: { color: "#888", fontSize: 15, marginBottom: 8 },
  authInput: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    color: "white",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  authError: { color: "#ff4466", fontSize: 13, textAlign: "center" },
  authSuccess: { color: "#00e5ff", fontSize: 13, textAlign: "center" },
  authBtn: {
    width: "100%",
    backgroundColor: "white",
    paddingVertical: 15,
    borderRadius: 999,
    alignItems: "center",
    marginTop: 6,
  },
  authBtnText: { fontWeight: "900", fontSize: 16, letterSpacing: 1 },
  authToggle: {
    color: "#888",
    fontSize: 13,
    marginTop: 4,
    textDecorationLine: "underline",
  },

  nav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 74,
    paddingBottom: 10,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.9)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  navItem: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 6,
    borderRadius: 14,
  },
  navItemActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  navIcon: { fontSize: 18, opacity: 0.8 },
  navIconActive: { opacity: 1 },
  navText: { color: "#bbb", fontSize: 10, fontWeight: "700" },
  navTextActive: { color: "white" },
  navCenter: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.35)",
  },
  navCenterText: { fontSize: 22 },
});