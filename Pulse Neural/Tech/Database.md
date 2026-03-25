Purpose

The Database stores all data for the Pulse app and acts as the source of truth for the system.

It supports all features including Pulse System, Heatmap System, Tonight System, and Leaderboard System.

---

Database Type

Supabase Postgres

Used for

Storing user data  
Storing venue data  
Storing pulse events  
Storing tonight responses  
Storing venue activity

---

Core Tables

Users

Stores user accounts

Fields

id  
username  
created at

---

Venues

Stores all venues shown on the map

Fields

id  
name  
latitude  
longitude  
created at

---

Pulse Events

Stores every pulse created by users

Fields

id  
user id  
venue id  
latitude  
longitude  
timestamp

Purpose

Drives heatmap and venue activity

---

Venue Stats

Stores calculated activity per venue

Fields

venue id  
pulse count  
last updated  
bpm

Purpose

Used for leaderboard and visual scaling

---

Tonight Responses

Stores whether users are going out

Fields

id  
user id  
date  
response yes no maybe  
updated at

---

Tonight Venue Choices

Stores which venue users plan to go to

Fields

id  
user id  
date  
venue id  
updated at

---

Relationships

Users to Pulse Events

One user can create many pulse events

Venues to Pulse Events

One venue can have many pulse events

Venues to Venue Stats

One venue has one stats record

Users to Tonight Responses

One user has one response per day

Users to Tonight Venue Choices

One user has one venue choice per day

---

Data Flow

When user presses Pulse

A new record is created in Pulse Events

Venue Stats is updated

BPM is recalculated

---

When user answers Tonight question

A record is created or updated in Tonight Responses

If user selects a venue

A record is created or updated in Tonight Venue Choices

---

When app loads

Frontend requests

Venues  
Venue Stats  
Relevant pulse data

Backend returns data

Frontend renders map leaderboard and tonight

---

Important Rules

Only one active Tonight Response per user per day

Only one active Tonight Venue Choice per user per day

Pulse Events are time based and should expire from calculations after about 20 minutes

Venue Stats should reflect only active pulses

---

Common Issues

Venue fetch returns zero

Possible causes

Wrong table name  
Empty database  
Query not returning data  
Frontend not handling response correctly  
Supabase client not connected properly

---

Pulse not saving

Possible causes

Insert query not being called  
Missing required fields  
Wrong table name  
No user id being passed  
Network or auth issue

---

BPM not updating

Possible causes

Venue Stats not updating after pulse  
Pulse events not being counted correctly  
Old pulses not being removed from calculation  
Calculation logic not running

---

Tonight responses not saving

Possible causes

Duplicate entries instead of update  
Wrong date handling  
Missing user id  
Backend not updating existing row

---

Data Integrity Rules

Every pulse event should have

Valid user id  
Valid timestamp  
Valid location  
Optional but preferred valid venue id

Every venue should have

Valid coordinates  
One stats record

Every user should have

One response per night in Tonight Responses

One venue choice per night in Tonight Venue Choices

---

Time Based Logic

Pulse events are temporary

They should only affect

Heatmap  
Venue activity  
Leaderboard

for about 20 minutes

After that

They should not contribute to BPM or heatmap

---

Query Expectations

Frontend should be able to

Fetch all venues

Fetch venue stats

Insert pulse event

Update tonight response

Update tonight venue choice

---

Debugging Approach

When something breaks

Check in this order

1 Is frontend sending request

2 Is backend receiving request

3 Is database storing data

4 Is data being returned correctly

5 Is UI rendering correctly

---

Future Improvements

Add indexes for faster queries

Add constraints to prevent duplicate records

Add server side validation

Add logs for debugging

Add automated cleanup of old pulse events

---

Key Insight

If the database is correct

Everything else becomes easier

If the database is wrong

Everything else breaks

---

Links

[[Architecture  ]]
[[Pulse System  ]]
[[Heatmap System]]  
[[Leaderboard System]]  
[[Tonight System]]

