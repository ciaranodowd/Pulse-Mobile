Purpose

Active Pulse Logic defines which pulses currently matter in the system and how they affect the app.

It explains which pulses affect heatmap, which pulses affect venue activity, and when a pulse should stop counting.

---

Definition Of An Active Pulse

A pulse is active if its expires_at value is later than the current time.

If expires_at is in the past the pulse is no longer active.

Active pulses should be the only pulses used for live app behaviour.

---

Why This Matters

The app is based on recent activity not historical activity.

Old pulses should not keep venues looking busy.

Old pulses should not keep the heatmap glowing.

Only recent pulses should shape the current state of the night.

---

Pulse Types

The system currently supports at least two pulse sources

auto  
manual

Auto pulses are created automatically during location tracking.

Manual pulses are created when the user presses the Pulse Here button.

Both types can affect the system if they are active.

---

Venue Linked Pulses

A venue linked pulse is a pulse where venue_id is not null.

These pulses should affect

venue busyness  
leaderboard ranking  
venue reactions  
possible BPM logic

These are the strongest pulses for venue level logic.

---

Location Only Pulses

A location only pulse is a pulse where venue_id is null.

These pulses should affect

nearby density  
heatmap display

These pulses should not directly affect

venue leaderboard  
venue BPM

unless your code later assigns them to a nearby venue

---

User Linked Pulses

A user linked pulse is a pulse where user_id is not null.

These pulses are better for

dedupe protection  
spam control  
future analytics

If user_id is null the pulse can still work for heatmap but is weaker for data integrity.

---

Active Pulse Rules

If pulse is active and venue_id is not null  
count it for venue logic and heatmap

If pulse is active and venue_id is null  
count it for heatmap only

If pulse is expired  
do not count it for anything live

---

Heatmap Logic

Heatmap should use all active pulses in the local area.

This includes

venue linked pulses  
location only pulses

Expired pulses should not affect the heatmap.

The heatmap should fade naturally as pulses expire.

---

Venue Logic

Venue logic should use active pulses where venue_id is not null.

These pulses should influence

venue glow  
venue reactions  
leaderboard position  
busyness value

Null venue pulses should not directly increase venue busyness.

---

Leaderboard Logic

Leaderboard should use only active pulses that are linked to venues.

A clean baseline rule is

group active pulses by venue_id  
count them  
rank venues highest to lowest

This gives a simple live measure of venue activity.

---

Current Risk Areas

If too many pulses have venue_id null  
heatmap may look active while venue rankings remain weak

If too many pulses have user_id null  
duplicate protection becomes weaker

If auto pulses fire too often  
activity may be inflated

If expired pulses are not filtered out correctly  
the app will overstate activity

---

Recommended Clean Rule Set

Heatmap uses all active pulses

Venue ranking uses active pulses with venue_id

Duplicate protection should apply where user_id and venue_id are both present

Expired pulses should never count in live features

---

Debugging Questions

When debugging activity issues ask

Are expired pulses being filtered out

Are null venue pulses being counted in venue logic by mistake

Are auto pulses happening too often

Are anonymous pulses bypassing duplicate protection

---

Future Improvements

Assign nearest venue more reliably

Reduce null venue pulses where possible

Require user login for stronger data quality later

Weight manual pulses differently from auto pulses if needed

Add clearer cleanup logic for expired pulses

---

Key Insight

Not every pulse should affect every system.

Heatmap uses broad live activity.

Venue ranking uses only venue linked live activity.

That separation is what keeps the app accurate.

---

Links

[[Pulse Insert Logic  ]]
[[Pulse System  ]]
[[Heatmap System  ]]

[[Leaderboard System  ]]
[[Database]]
