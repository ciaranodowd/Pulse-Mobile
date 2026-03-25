Pulses Row Level Security

Status  
Still used but needs review

---

What it does

Enables row level security on the pulses table

Allows

Anyone even not logged in  
to read pulses  
to insert pulses

---

Why it matters

This directly controls who can

Create pulses  
Read heatmap data

So this affects

Heatmap  
Pulse System  
Abuse risk

---

What is good about it

1  
Very simple

No auth issues  
App will always be able to insert pulses

Good for early MVP

---

2  
Ensures heatmap always works

Even if user is not logged in

---

What is risky

This is the important part

Right now

Anyone can spam your pulses table

Because

No user check  
No rate limit  
No validation

This means someone could

Script 1000 pulses  
Fake busy venues  
Break your BPM

---

Also important

You do NOT store user_id in pulses table currently

So even if you wanted to control spam later

You cannot track who sent pulses

---

So right now your system is

Fully open  
Anonymous  
Unrestricted

Which is fine short term  
but dangerous long term

---

What to write in your Backend Audit

Pulses Row Level Security

Status  
Still used

Purpose  
Allows reading and inserting pulses

Strength  
Simple  
Works for MVP

Risk  
No authentication  
No rate limiting  
Open to spam and fake data

---

Recommended direction (do NOT rush yet)

Do NOT change this immediately

Instead plan this upgrade later

Step 1  
Add user_id column to pulses table

Step 2  
Change insert policy to

auth.uid() = user_id

Step 3  
Add basic rate limiting in app logic

---

Important insight for your system

Right now

Pulse System is anonymous

Tonight System is authenticated

That is a mismatch

Eventually you want

Both tied to user accounts
