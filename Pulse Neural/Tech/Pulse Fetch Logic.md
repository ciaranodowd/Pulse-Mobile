Pulse Fetch Logic

Purpose

Defines how pulses are loaded from the database and stored in app state.

This is the main source of truth for heatmap, leaderboard, and venue activity.

---

SQL Query

Pulses are fetched from Supabase using the following query

supabase.from pulses  
select id latitude longitude created_at expires_at source venue_id user_id age_bracket  
filter expires_at greater than current time  
order by created_at descending  
limit 1200

---

Actual Code

const loadPulses = async () => {  
const { data, error } = await supabase  
.from("pulses")  
.select("id, latitude, longitude, created_at, expires_at, source, venue_id, user_id, age_bracket")  
.gt("expires_at", new Date().toISOString())  
.order("created_at", { ascending: false })  
.limit(1200);

if (error) {  
setStatus(`Load error: ${error.message}`);  
return;  
}

setPulses((data || []).map((p) => ({  
id: p.id,  
latitude: p.latitude,  
longitude: p.longitude,  
createdAt: p.created_at,  
expiresAt: p.expires_at,  
source: p.source,  
venueId: p.venue_id,  
userId: p.user_id,  
ageBracket: p.age_bracket ?? null,  
})));  
};

---

Key Behaviour

Only active pulses are fetched  
Expired pulses are filtered out at SQL level

Newest pulses appear first

Maximum of 1200 pulses are loaded

---

Why This Matters

This query powers

Heatmap  
Leaderboard  
Venue reactions

If this query is wrong  
the entire app becomes inaccurate

---

Important Notes

Expired pulses are filtered using expires_at greater than now

This is critical to keep the app real time

The 1200 limit may hide older active pulses if the system grows

---

Risks

If limit is too low  
busy areas may lose data

If expires_at filtering fails  
old pulses may inflate activity

---

Links

[[Active Pulse Logic]]  
[[Pulse Insert Logic  ]]
[[Realtime Logic  ]]
[[Leaderboard System ]]

[[Database]]
