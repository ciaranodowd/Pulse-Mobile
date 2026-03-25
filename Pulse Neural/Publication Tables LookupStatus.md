Status  
Useful for debugging only

---

What it does

Lists all tables that are included in the Supabase realtime publication.

It shows which tables will send realtime updates.

---

Why it matters

This helps you check if realtime is set up correctly.

For example

You can confirm if pulses is included

---

What it does NOT do

It does not affect your app directly

It does not change data

It does not control logic

---

When you would use it

When debugging realtime

For example

Check if pulses is in realtime

If it is missing  
your heatmap will not update live

---

Example use

Run

select from pg_publication_tables where pubname equals supabase_realtime

Look for pulses in the result

---

What to write in Backend Audit

Publication Tables Lookup

Status  
Debug tool

Purpose  
Check which tables are included in realtime

Importance  
Not required for app functionality  
Only used when debugging
