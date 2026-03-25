Purpose

Pulse Handler Logic defines what happens when the user manually presses the pulse button.

It covers haptics, animation, venue reactions, cooldowns, venue linking, and database insert.

---

Trigger

The manual pulse flow is triggered by the pulse button

onPress equals onPulseHere

---

Actual Code

const onPulseHere = async () => {  
try {  
if (cooldownLeft > 0) {  
setStatus(`Wait ${cooldownLeft}s before pulsing again.`);  
return;  
}

try {  
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);  
  setTimeout(() => {  
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);  
  }, 120);  
} catch (_) {}  
  
const fix = location ?? (await getOneLocationFix());  
setLocation(fix);  
  
const activeMapRef = [mapRefAll, mapRefAge, mapRefFriends][mapPage] ?? mapRefAll;  
if (activeMapRef.current && fix?.latitude && fix?.longitude) {  
  try {  
    const pt = await activeMapRef.current.pointForCoordinate({  
      latitude: fix.latitude,  
      longitude: fix.longitude,  
    });  
    setPulseScreenPos({ x: pt.x, y: pt.y });  
  } catch {  
    setPulseScreenPos(null);  
  }  
}  
  
const activeOrbRef = [orbRefAll, orbRefAge, orbRefFriends][mapPage] ?? orbRefAll;  
activeOrbRef.current?.flash();  
await new Promise((r) => setTimeout(r, 300));  
triggerPulseRipple(fix);  
triggerPulseAnimation();  
  
if (pulseGlowTimerRef.current) clearTimeout(pulseGlowTimerRef.current);  
setShowEdgePulse(true);  
pulseGlowTimerRef.current = setTimeout(() => setShowEdgePulse(false), EDGE_GLOW_DURATION_MS);  
  
const allVenues = venuesRef.current;  
const venuesToReact = DEBUG_PULSE_REACTIONS  
  ? allVenues  
  : allVenues.filter((v) =>  
      haversineMeters(fix.latitude, fix.longitude, v.latitude, v.longitude) < PULSE_REACTION_RADIUS_M  
    );  
  
const venueDelays = venuesToReact.map((v) => {  
  const dist = haversineMeters(fix.latitude, fix.longitude, v.latitude, v.longitude);  
  const delay = Math.min(800, dist * 0.4);  
  return { id: v.id, delay };  
});  
  
const buckets = {};  
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
  
const linkedVenue =  
  selectedVenue ??  
  nearestVenueWithinRadius(  
    fix.latitude,  
    fix.longitude,  
    venuesRef.current,  
    PULSE_VENUE_LINK_RADIUS  
  );  
  
await addPulseToDb({  
  lat: fix.latitude,  
  lon: fix.longitude,  
  source: "manual",  
  venueId: linkedVenue?.id ?? null,  
});  
  
setCooldownLeft(MANUAL_COOLDOWN_SECONDS);  
  
if (selectedVenue) addFavouriteVenue(selectedVenue);

} catch (e) {  
setStatus(`Pulse error: ${String(e?.message || e)}`);  
}  
};

---

Manual Pulse Flow

1 Check cooldown  
2 Trigger haptics  
3 Get current location  
4 Resolve pulse screen position  
5 Flash orb and pulse animations  
6 Trigger venue reaction wave  
7 Link pulse to selected venue or nearest venue  
8 Insert pulse into database  
9 Start manual cooldown  
10 Add selected venue to favourites if applicable

---

Venue Linking Rule

Manual pulse uses selectedVenue first

If no venue is selected  
it falls back to nearest venue within radius

If no venue is nearby  
venue_id becomes null

---

What This Means

The current app already supports lower friction manual pulsing

The user does not always need to tap a venue first

If no venue is selected  
the app can still auto link to the nearest venue

---

Strengths

Rich feedback  
Strong visual response  
Supports automatic nearest venue linking  
Cooldown reduces spam  
Adds wave based venue reaction

---

Risks

Current code still references mapRefFriends and orbRefFriends even though Friends is being removed

If those remain in the code they may become cleanup targets later

The handler does many UI tasks plus data logic in one function

This makes it powerful but harder to maintain

---

Future Improvements

Split UI animation and database logic into helper functions

Remove Friends related refs if feature is gone

Reduce friction further by making the main pulse interaction more obvious

---

Key Insight

Manual pulsing is already more advanced than just pressing a button

It combines feedback, animation, venue reaction, and data insert in one flow

---

Links

[[Pulse System  ]]
[[Pulse Insert Logic  ]]
[[Venue Linking Logic  ]]
[[Map System  ]]
[[Heatmap System  ]]
[[Database]]
