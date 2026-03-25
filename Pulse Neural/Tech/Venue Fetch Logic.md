Purpose

Venue Fetch Logic defines how venues are loaded into the app.

Unlike pulses, venues are not currently fetched from Supabase.  
They are fetched from the Overpass API based on the user location.

---

How It Works

When location becomes available

The app sends a query to the Overpass API

It searches for nearby places with amenity values matching

pub  
bar  
nightclub

The app tries multiple Overpass endpoints in case one fails

Results are cleaned and deduplicated before being stored in app state

---

Actual Code

const fetchVenuesOverpass = async (lat, lon) => {  
const endpoints = [  
"[https://overpass-api.de/api/interpreter](https://overpass-api.de/api/interpreter)",  
"[https://overpass.kumi.systems/api/interpreter](https://overpass.kumi.systems/api/interpreter)",  
"[https://overpass.nchc.org.tw/api/interpreter](https://overpass.nchc.org.tw/api/interpreter)",  
];

const query = `[out:json][timeout:25]; ( node(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"]; way(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"]; relation(around:${VENUE_RADIUS_METERS},${lat},${lon})["amenity"~"pub|bar|nightclub"]; ); out tags center;` .trim();

let lastErr = null;

for (const url of endpoints) {  
try {  
const controller = new AbortController();  
const timeout = setTimeout(() => controller.abort(), 12000);

  const res = await fetch(url, {  
    method: "POST",  
    headers: { "Content-Type": "text/plain;charset=UTF-8" },  
    body: query,  
    signal: controller.signal,  
  });  
  
  clearTimeout(timeout);  
  
  if (!res.ok) throw new Error(`Overpass ${res.status}`);  
  
  const json = await res.json();  
  const seen = new Set();  
  const deduped = [];  
  
  for (const e of json.elements || []) {  
    const name = e.tags?.name || e.tags?.["name:en"] || null;  
    const type = e.tags?.amenity || null;  
    const vLat = Number(e.lat ?? e.center?.lat);  
    const vLon = Number(e.lon ?? e.center?.lon);  
  
    if (!Number.isFinite(vLat) || !Number.isFinite(vLon)) continue;  
  
    const key = `${vLat.toFixed(5)}-${vLon.toFixed(5)}-${type || ""}`;  
    if (seen.has(key)) continue;  
    seen.add(key);  
  
    deduped.push({  
      id: `${e.type}-${e.id}`,  
      name: name || (type ? type.toUpperCase() : "VENUE"),  
      kind: type || "venue",  
      latitude: vLat,  
      longitude: vLon,  
    });  
  }  
  
  return deduped.slice(0, VENUE_MAX);  
} catch (err) {  
  lastErr = err;  
}

}

throw lastErr || new Error("Overpass failed");  
};

useEffect(() => {  
if (!location) return;

let alive = true;  
let tries = 0;

const run = async () => {  
tries++;

try {  
  const v = await fetchVenuesOverpass(location.latitude, location.longitude);  
  if (!alive) return;  
  setVenues(v);  
} catch {  
  if (!alive) return;  
  if (tries < 2) setTimeout(() => alive && run(), 1500);  
}

};

const t = setTimeout(run, 600);

return () => {  
alive = false;  
clearTimeout(t);  
};  
}, [location?.latitude, location?.longitude]);

---

Key Behaviour

Venues are location dependent

Venue results are not static and may change based on location

The app retries once if venue fetch fails

The app waits briefly before the initial fetch

---

Important Implications

Venue ids come from Overpass data not from your own database

That means venue ids are generated like type dash id

Example  
node dash 123456

This is important because pulses store venue_id values based on these fetched venues

---

Strengths

No need to manually build and maintain a venue database

Works dynamically in different areas

Multiple endpoint fallback improves reliability

---

Risks

Overpass can fail or be slow

Venue data may vary between sessions or locations

If venue fetch fails then nearby venue linking becomes weaker

Because pulses rely on venue ids from this venue list

---

Debugging Questions

If venues are empty ask

Did location resolve

Did Overpass fail

Did all endpoints fail

Did deduping remove too much

Did VENUE_MAX cut results down too far

---

Future Improvements

Cache venue results

Preload important venues for Galway

Move to a curated venue database later if needed

Use your own venue metadata for cleaner names and richer cards

---

Key Insight

Venues are currently an external live data source

They are not the source of truth in Supabase

Supabase stores pulses  
Overpass supplies venue candidates

---

Links

[[Map System  ]]
[[Pulse Insert Logic ]] 
[[Venue Linking Logic  ]]
[[Architecture]]
