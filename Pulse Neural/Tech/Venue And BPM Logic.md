Purpose

Venue And BPM Logic explains how venue activity is currently calculated in the app.

It defines how pulses become venue busyness and how the leaderboard is ranked.

---

Where BPM Is Calculated

BPM is currently calculated in frontend code not in SQL.

It is derived from the pulses array already loaded into app state.

There is no separate backend BPM query or SQL function.

---

Current BPM Window

The app uses a 10 minute activity window for BPM calculation.

Only pulses created within the last 10 minutes count toward BPM.

---

Current BPM Formula

For each venue

Count pulses in the last 10 minutes

Then divide by 10

BPM equals pulsesInWindow divided by 10

This means BPM is an activity rate based on recent pulses.

---

Venue Inclusion Rule

A pulse only affects venue BPM if venue_id is present.

If venue_id is null

It can still affect heatmap

But it should not affect venue BPM or leaderboard ranking

---

Going Now Logic

The app also calculates a going now value.

This counts unique users with non expired pulses linked to a venue.

A pulse only contributes to going now if

venue_id is present  
user_id is present  
expires_at is still in the future

This is separate from BPM and acts as a tie breaker.

---

Leaderboard Sort Logic

Venues are sorted by

1 highest BPM first  
2 highest going now second

Only the top 30 venues are shown.

---

Important Timing Rules

BPM uses created_at and a 10 minute window

Going now uses expires_at and active status

Pulse lifetime in the current code is 30 minutes not 20 minutes

This is important and should be reflected in documentation

---

What This Means

Heatmap and venue ranking are related but not identical

Heatmap can use broader live pulse activity

Leaderboard uses only venue linked pulses

Going now uses only venue linked and user linked active pulses

---

Current Strengths

Simple logic  
Fast frontend calculation  
Clear separation between BPM and going now  
No need for complex backend aggregation yet

---

Current Risks

Frontend calculates the leaderboard so every client repeats the same work

If pulses array is incomplete leaderboard becomes inaccurate

Null venue_id pulses reduce venue ranking strength

Null user_id pulses do not count toward going now

Auto pulses may inflate BPM if not tuned carefully

---

Design Implications

The app already supports low friction venue linking through nearest venue within 150 metres

This means the product can move away from requiring users to tap a venue card first

The better target flow is

user presses one main Pulse button  
system links nearest venue automatically if within radius  
heatmap updates  
venue BPM updates  
venue reacts visually

---

Key Insight

BPM is not a stored backend metric

It is a frontend derived activity rate based on venue linked pulses from the last 10 minutes

---

Links

[[Active Pulse Logic ]] 
[[Pulse Insert Logic  ]]
[[Pulse System  ]]
[[Heatmap System  ]]
[[Leaderboard System  ]]
[[Database  ]]
[[Architecture]]