Pulse System

Purpose  
The Pulse System is the core interaction of the app. It allows users to signal intent or activity and creates a real time representation of nightlife energy.

It is responsible for  
Making the app feel alive  
Generating data for venue popularity  
Driving the core loop

---

User Flow  
1 User opens app  
2 User taps Pulse  
3 Haptic feedback triggers  
4 Pulse animation radiates outward  
5 Nearby venues visually respond  
6 Pulse is recorded in backend  
7 Venue activity updates  
8 Other users see updated data

---

Frontend Logic React Native Expo

Trigger  
Button press or map interaction

Actions  
Trigger haptics using expo haptics  
Start animation ripple effect  
Send pulse event to backend

Example Flow  
onPress calls handlePulse

handlePulse does  
triggerHaptic  
runAnimation  
sendPulseToBackend

---

Animation Behaviour

Current  
Large block style flash  
Choppy rendering  
Too visually aggressive

Target  
Small ripple expanding outward  
Smooth easing  
Opacity fades over time  
Subtle multiple rings

Parameters  
Duration 600 to 1000 ms  
Max radius small to medium  
Opacity fades to zero  
Color purple glow

---

Venue Reaction Logic

When pulse reaches a venue  
Venue briefly glows  
Slight scale increase then return to normal  
Glow fades smoothly

Goal  
Give feedback without overwhelming the UI

---

Backend Logic Supabase

On pulse  
Insert into pulse events table  
Update venue stats

Flow  
Receive pulse event  
Identify nearest or selected venue  
Insert record  
Increment pulse count  
Update timestamp

---

Database Design

pulse events  
id  
user id  
venue id  
timestamp

venue stats  
venue id  
pulse count  
last updated

Future  
weighted score  
rolling activity

---

Data Processing Logic

Current  
Simple count of pulses

Future  
Recent pulses weighted higher  
Old pulses decay  
Detect trends

Example  
A pulse at 10pm matters more than a pulse at 8pm

---

Edge Cases

User spams pulse  
No nearby venues  
User offline  
Duplicate pulses  
Backend failure

Handling  
Rate limit pulses for example one every 5 to 10 seconds  
Still show animation if offline  
Retry failed requests

---

Performance Risks

Too many animations  
Frame drops  
Network delay

Mitigation  
Limit animations  
Use native driver  
Reduce backend calls

---

Security Risks

Fake pulses  
Spam  
No authentication

Future Fixes  
Require login  
Add rate limiting  
Validate requests

---

Current Issues

Pulse animation too large  
Animation not smooth  
Venue response feels unnatural  
Icons and glow not synced

---

Improvements

Short term  
Fix animation smoothness  
Reduce pulse size  
Improve glow

Medium term  
Add pulse weighting  
Improve responsiveness  
Better visuals

Long term  
Friend pulses  
Heatmap  
Predictions

---

Connection to Core Loop

Pulse feeds the system

Without pulses  
No data  
No value  
No retention

More pulses means more success

---

Key Insight

Pulse is not just a feature  
It is the engine of the app
[[Core idea.md]] 
[[Core Loop.md]]
[[Core Metrics.md]]

