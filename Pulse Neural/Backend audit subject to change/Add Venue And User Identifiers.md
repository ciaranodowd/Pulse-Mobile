Add Venue And User Identifiers

Status  
Still used and important

---

What it does

Adds two columns to the pulses table

venue_id  
user_id

---

Why it matters

This upgrades your pulses table from

anonymous location data

to

structured activity data

Now each pulse can be linked to

A user  
A venue

---

What is good about it

1  
Enables venue tracking

Now you can directly link pulses to venues

This is required for

BPM calculation  
Leaderboard  
Venue activity

---

2  
Enables user tracking

Now you can

Track who sent pulses  
Prevent spam later  
Add rate limiting later

---

3  
Matches your product logic

You said

Pulse adds to nearby density  
and to a venue

This column makes that possible

---

Important issue (VERY important)

user_id is text

But your users table uses uuid

This is a mismatch

Same issue may exist for venue_id depending on your venues table

---

Why this matters

If types do not match

You cannot properly

Join tables  
Enforce relationships  
Use foreign keys

It will cause bugs later

---

What you should check now

Go to your venues table

Check type of id

If it is uuid

Then venue_id in pulses should also be uuid

---

Same for users

user_id should be uuid  
not text

---

Current situation

Right now

You can store values  
but database cannot enforce correctness

---

Recommended future fix (do not rush immediately)

Eventually change to

user_id uuid  
venue_id uuid

and link them with foreign keys

---

Also important

You added columns

But your row level security still allows

Anyone to insert anything

So currently

user_id can be fake  
venue_id can be fake

---

So your system now is

Better structured  
but still not protected

---

What to write in your Backend Audit

Add Venue And User Identifiers

Status  
Still used

Purpose  
Links pulses to users and venues

Strength  
Enables BPM and tracking  
Matches product logic

Issue  
user_id is text not uuid  
venue_id type needs verification

Risk  
No validation or protection yet