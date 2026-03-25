Realtime Logic

Purpose

Realtime Logic defines how new pulses are added into app state instantly without waiting for a full reload.

It is what makes the app feel live.

---

How It Works

When the app loads

It first calls loadPulses to fetch active pulses from Supabase

Then it opens a realtime channel to listen for new pulse inserts

When a new pulse is inserted into the pulses table

The app receives that row and adds it to local state

---

Actual Code

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
        ageBracket: p.age_bracket ?? null,  
      },  
      ...prev,  
    ]);  
  }  
)  
.subscribe();

return () => supabase.removeChannel(ch);  
}, []);

---

What It Listens For

Event type

INSERT

Table

public.pulses

This means the app reacts to newly created pulses only

It does not currently listen for update or delete events

---

Expiry Guard

Even though the SQL fetch already filters active pulses

The realtime handler also checks expires_at before adding the pulse to state

If the new pulse is already expired  
it is ignored

This is an extra safety layer

---

Why This Matters

This is what allows

live heatmap updates  
live venue activity feel  
instant pulse visibility

Without realtime

the app would need to keep manually refetching pulses

That would feel slower and less alive

---

Strengths

Simple and effective

Only listens for new inserts

Avoids full reload after every pulse

Matches the current live product feel

---

Limitations

It does not remove expired pulses from local state by itself

It does not listen for delete events

It does not listen for updates

So local state may still rely on other logic to stop old pulses affecting UI

---

Important Relationship To Other Logic

Initial state comes from Pulse Fetch Logic

Realtime only adds new pulses after that

So the full pulse state is

initial active pulses from database  
plus  
new inserted pulses from realtime

---

Debugging Questions

If live updates stop working ask

Is pulses included in supabase_realtime

Is the channel subscribing successfully

Are inserts actually reaching the pulses table

Are new pulses failing the expiry guard

---

Future Improvements

Optionally prune expired pulses from local state on an interval

Optionally listen for delete events if cleanup is moved server side

Optionally prevent duplicate inserts into local state if race conditions appear

---

Key Insight

Realtime Logic is additive

It loads current active pulses once  
then streams new pulses into state as they happen

---

Links

[[Pulse Fetch Logic  ]]
[[Pulse Insert Logic  ]]
[[Active Pulse Logic  ]]
[[Database  ]]
[[Architecture  ]]
[[Heatmap System]]
