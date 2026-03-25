Purpose  
The Map System is the main visual screen of the app. It shows venues and their activity so users can quickly understand where people are going.

---

Core Features

Display venues on map  
Show activity level for each venue  
React to pulses  
Allow user interaction

---

User Flow

1 User opens app  
2 Map loads  
3 Venues appear  
4 User sees which venues are active  
5 User taps or pulses  
6 Map updates

---

Frontend Logic React Native Expo

Map loads using map component

For each venue  
Render marker on map

Each marker includes  
Position latitude and longitude  
Icon image  
Activity state

---

Rendering Logic

Fetch venues from backend

Loop through venues  
Render marker for each

Each marker updates based on activity

High activity  
Stronger glow  
Slightly larger

Low activity  
Dim glow  
Normal size

---

Marker Icons

Current Problem  
Icons showing as black dots  
Background not transparent  
Wrong file format or path

Fix

Use png files only  
Make sure background is transparent  
Place images inside project folder

Correct usage  
require path must match exactly  
example  
require ./assets/beer png

Make sure  
File names match exactly  
No capitalisation mistakes  
No spaces in wrong places

---

Icon Design

Each venue should have clear icon

Examples  
Beer icon for pubs  
Cocktail icon for clubs

Icons should  
Be simple  
Be bright  
Be visible on dark background

---

Glow System

Purpose  
Make venues feel alive

Current Problem  
Glow looks flat or not visible

Target

Each venue has glow around it  
Glow intensity based on activity

Low activity  
Very subtle glow

Medium activity  
Noticeable glow

High activity  
Strong glow and slight pulse

---

Glow Implementation Idea

Each marker has a circle behind it

Circle properties  
Radius changes based on activity  
Opacity changes based on activity

Animation  
Slow pulsing glow  
Not fast flashing

---

Pulse Interaction

When user pulses

Map should  
Send ripple outward  
When ripple reaches venue  
Venue reacts

Reaction  
Small scale increase  
Glow increase  
Fade back to normal

---

Current Issues

Icons appear as black dots  
Glow not smooth  
Pulse interaction feels choppy  
Map feels static

---

Performance Considerations

Too many animations can lag

Fix

Limit number of active animations  
Only animate visible markers  
Keep animations lightweight

---

Backend Interaction

Map fetches

Venue list  
Venue activity data

Updates

When pulse happens  
Map refreshes activity

---

Future Improvements

Dynamic scaling  
More popular venues appear bigger

Heatmap  
Show general activity zones

Clustering  
Group nearby venues

---

Connection to Pulse System

Map displays results of pulses

Without pulse system  
Map has no 


---

Key Insight

Map is the display layer  
Pulse is the data layer

Both must work together
[[Pulse System]]
[[Core Loop]]
[[Core Idea]]
