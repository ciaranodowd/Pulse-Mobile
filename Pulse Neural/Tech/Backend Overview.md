Purpose

This note defines the full backend architecture of the Pulse app.

It summarises how data flows through the system and which parts are core versus optional.

---

Core Architecture

The backend is a hybrid system made of

Supabase database  
Frontend logic  
External venue API

Supabase stores pulse data and user data  
Frontend calculates activity and ranking  
Overpass API provides venue data

---

Core Data Flow

1 User generates pulse

Manual or auto pulse is triggered  
Pulse is inserted into Supabase

---

2 Pulse stored in database

Table pulses stores

location  
time  
venue_id  
user_id  
source

---

3 Active pulses fetched

App fetches pulses where expires_at is greater than current time

These pulses form the live dataset

---

4 Realtime updates

New pulses are streamed into the app using realtime subscription

No full reload required

---

5 Frontend derives activity

Frontend processes pulses array

Calculates

heatmap density  
venue BPM  
going now  
leaderboard ranking

---

6 Venues fetched separately

Venues are not stored in Supabase

They are fetched dynamically from Overpass API

---

Core Systems

Pulse System  
Handles creation of pulse data

Heatmap System  
Uses all active pulses

Venue System  
Uses external venue data

Leaderboard System  
Ranks venues using pulse data

Tonight System  
Stores user intent data

Profile System  
Stores user data

---

Important Rules

Only active pulses should affect live features

Active means expires_at is greater than current time

Venue logic uses only pulses with venue_id

Heatmap uses all pulses

Leaderboard uses pulses in the last 10 minutes

---

Current Strengths

Simple architecture

Realtime updates

No heavy backend aggregation

Flexible venue system

Good separation of concerns

---

Current Weaknesses

Frontend does all aggregation

Null venue_id pulses weaken venue accuracy

Null user_id pulses weaken dedupe

Overpass API may be unreliable

Auto pulse frequency may inflate activity

---

Obsolete Or Low Priority Systems

Friends system

Demographics system

Unused profile fields

---

Design Direction

Move toward lower friction pulse flow

User presses one main pulse button

System assigns nearest venue automatically

Heatmap and venue activity update instantly

---

Future Improvements

Improve venue reliability

Tighten user and venue linking

Tune auto pulse behaviour

Move some aggregation to backend if scaling

Add better data validation

---

Key Insight

The backend is not a traditional backend

It is a real time data pipeline

Supabase stores raw activity  
Frontend turns it into meaning

---

Links

[[Pulse Fetch Logic  ]]
[[Pulse Insert Logic  ]]
[[Realtime Logic  ]]
[[Active Pulse Logic  ]]
[[Venue Fetch Logic  ]]
[[Venue Linking Logic  ]]
[[Venue And BPM Logic  ]]
[[Auto Pulse Logic  ]]
[[Pulse Handler Logic  ]]
[[Database  ]]
[[Architecture]]

