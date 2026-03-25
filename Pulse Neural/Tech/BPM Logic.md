BPM Logic

Purpose

BPM represents how busy a venue is based on recent pulse activity.

It is not stored directly but derived from pulse data.

---

Core Logic

BPM is based on active pulses linked to a venue.

Active pulses are pulses where expires_at is greater than current time.

---

Basic Formula

For each venue

Count number of active pulses

Example

select venue_id count from pulses where expires_at greater than now group by venue_id

---

Interpretation

More active pulses means higher BPM

Recent pulses matter more than older pulses

---

Current Implementation

BPM increases when user presses Pulse here on a venue

This creates a pulse with venue_id

---

Problem

Current system requires user to tap a venue first

This creates friction and reduces usage

---

Improved System

User presses one main Pulse button

System automatically assigns pulse to nearest venue

Heatmap updates

BPM updates automatically

No manual venue selection required

---

Future Improvements

Weight pulses by recency

Example newer pulses count more

Add decay over time

Combine with tonight intent data

---

Connection to Features

Pulse System generates data

Heatmap shows area activity

Leaderboard ranks venues using BPM

Map visualises BPM through glow and scaling

---

Key Insight

BPM is not a stored value

It is derived from pulse activity
