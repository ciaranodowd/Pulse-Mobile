Status  
Still used and important

What it does  
Adds a minute bucket to pulses and limits duplicate pulses so the same user cannot pulse the same venue multiple times in the same minute.

Why it matters  
This is one of the best anti spam protections you have so far.

It helps stop

accidental double taps  
button mashing  
inflated venue activity  
fake BPM spikes from repeated pulses

What is good about it

1  
Minute bucket is sensible

It groups pulses into minute windows

That is useful for

deduping  
counting  
aggregation  
future analytics

2  
Backfill is good

Existing rows get a value

That means the unique index can work on older data too

3  
Default is good enough for MVP

New rows automatically get a minute bucket

4  
Unique index is very useful

This is the most important part

One pulse per user per venue per minute

That is a very good rule for your current app

It matches real user behavior and protects the data

Important issue

This only works when both user_id and venue_id are present

That means if either one is missing

the protection does not apply

So if your app inserts pulses without user_id  
or without venue_id  
duplicates can still happen

That is the biggest thing to check

Second issue

user_id is still text in your pulses table based on what you showed earlier

The index will still work  
but the type mismatch problem still exists for long term cleanliness

Third issue

This only protects venue linked pulses

It does not stop duplicate location only pulses if venue_id is null

That may or may not matter depending on how your heatmap works

Why this is strong for BPM

Because BPM should reflect meaningful activity  
not repeated taps from the same user in a few seconds

This query helps make BPM more trustworthy

What to write in your Backend Audit

Per Minute Pulse Bucketing

Status  
Still used

Purpose  
Prevents duplicate pulse spam per user per venue per minute

Strength  
Very useful for BPM integrity  
Good anti spam protection for MVP

Check needed  
Make sure app always sends user_id and venue_id when pulsing

Limitation  
Does not protect pulses where venue_id or user_id is missing

Big insight so far

Your pulse system is more thought through than it first looked

You now have

pulse lifetime  
venue linking  
user linking  
deduping by minute  
possible realtime support

That is actually a solid base

Current audit summary

Geolocation Pulses  
Still used  
Core heatmap table  
Needs review for stronger typing and validation

Add Pulses To Realtime Publication  
Still used  
Important  
Frontend usage unconfirmed

Daily Outing Responses  
Still used  
Good structure  
Needs update policy added

Tonight Plans Per User  
Still used  
Good structure  
Check venue_id type against venues table

Pulses Row Level Security  
Still used  
Works for MVP  
Too open and insecure long term

Add Venue And User Identifiers  
Still used  
Important  
Type mismatch risk

Per Minute Pulse Bucketing  
Still used  
Very useful  
Needs app to always send user_id and venue_id



