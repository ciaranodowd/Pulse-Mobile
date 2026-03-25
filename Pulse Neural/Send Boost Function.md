Status  
Still used (if you plan venue promotions)  
Not part of core user loop

---

# 🧠 What it does

Allows **venue business accounts** to send boosts

A boost is:

- a message
- tied to a venue
- lasts 15 to 60 minutes
- expires automatically

---

# 🔥 What this means for your system

You now have:

### User side

Pulses  
Heatmap  
BPM (likely based on pulses)

### Business side

Boosts  
Promotions  
Messages

---

# 🧠 Why this is NOT your BPM

This function:

- does NOT count pulses
- does NOT calculate activity
- does NOT rank venues

👉 It only inserts into a `boosts` table

---

# ⚠️ IMPORTANT INSIGHT

Your app currently likely has:

👉 **BPM = pulse-based activity (implicit)**  
👉 **Boosts = manual promotion (explicit)**

---

# 🚨 BIG UX PROBLEM YOU IDENTIFIED (and you're right)

Current flow:

User taps venue  
User presses “Pulse here”  
BPM increases

👉 This is friction-heavy

---

# ✅ BETTER SYSTEM (this is key)

You already described the correct version:

### New flow

User presses ONE main Pulse button

Then automatically:

- pulse is created at user location
- nearest venue is assigned
- heatmap updates
- BPM updates
- nearby venues react

---

# 🧠 WHERE YOUR BPM ACTUALLY IS

Based on everything:

👉 BPM is NOT a function  
👉 BPM is NOT in a named query

👉 It is likely:

### Option 1 (most likely)

Calculated in frontend from pulse counts

### Option 2

Calculated from:  
count pulses where expires_at > now grouped by venue_id
