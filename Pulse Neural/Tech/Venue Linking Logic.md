Purpose

Venue Linking Logic defines how a pulse is connected to a venue.

It is used by both manual and auto pulse flows.

---

Core Rule

The app finds the nearest venue within a fixed radius.

If a venue is found inside that radius  
the pulse is linked to that venue.

If no venue is found  
venue_id is null.

---

Actual Code

const nearestVenueWithinRadius = (lat, lon, venues, radiusM) => {  
let best = null;  
let bestDist = Infinity;

for (const v of venues) {  
const d = haversineMeters(lat, lon, v.latitude, v.longitude);

if (d <= radiusM && d < bestDist) {  
  best = v;  
  bestDist = d;  
}

}

return best;  
};

---

Radius

PULSE_VENUE_LINK_RADIUS equals 150 metres

---

Manual Pulse Rule

Manual pulse uses selectedVenue first

If selectedVenue does not exist  
it falls back to nearest venue within radius

---

Auto Pulse Rule

Auto pulse always uses nearest venue within radius

---

Why This Matters

This logic is what allows pulses to affect venue activity automatically

Without this  
pulses would only affect the heatmap unless users manually selected venues

---

Strengths

Simple  
Fast  
Supports low friction usage  
Works for both auto and manual flows

---

Risks

If venue data is inaccurate  
venue linking becomes inaccurate

If no venue is nearby  
venue_id becomes null and leaderboard strength is reduced

If Overpass venue data changes  
linking behaviour may feel inconsistent

---

Future Improvements

Improve venue quality with curated local data

Allow different radius rules by venue density

Track confidence of venue assignment if needed

---

Key Insight

Venue linking is the bridge between raw pulse location data and venue level activity

---

Links

[[Venue Fetch Logic  ]]
[[Pulse Insert Logic  ]]

[[Auto Pulse Logic  ]]
[[Pulse Handler Logic  ]]
[[Venue And BPM Logic  ]]
[[Database]]
