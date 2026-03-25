Heatmap System

Purpose

The Heatmap System visualises nearby activity and venue busyness in real time.

It shows where pulses are happening and helps users understand which areas and venues are active.

---

Core Behaviour

When a user presses Pulse

A pulse is created at the user location

This pulse contributes to

Nearby area density  
Nearest venue activity , if they are within 30 metres.

The pulse remains active for a limited time

Current duration should be approximately 20 minutes

After this time the pulse should no longer contribute to the heatmap or venue activity

---

User Flow

1 User opens map  
2 Heatmap is visible on map  
3 User sees areas with higher activity  
4 User presses Pulse  
5 Heatmap intensity increases around user  
6 Nearby venues react visually  
7 Over time the pulse fades out

---

Heatmap Logic

Each pulse adds intensity to a location

Multiple pulses in the same area increase intensity

Intensity decreases over time as pulses expire

Heatmap should feel smooth and continuous

Not blocky or static

---

Venue Interaction

Each pulse is also linked to a nearby venue

When a pulse occurs

Nearest venue receives activity increase

Venue should respond visually

Glow effect increases briefly  
Slight scale increase then returns to normal

---

Pulse Lifetime

Each pulse has a time window

Current value around 20 minutes

After expiry

Pulse should be removed from

Heatmap calculations  
Venue activity calculations

---

Venue Activity Calculation

Each venue has a busyness score

This is calculated using a formula in code

Measured in BPM

BPM represents how active or busy a venue is
A card showing bpm shows up when the user clicks on a venue


Inputs likely include

Number of active pulses  
Recency of pulses  
Frequency of pulses

---

Display Behaviour

Heatmap

Low activity  
Faint glow

Medium activity  
Noticeable colour

High activity  
Strong bright area

Venue markers

Low BPM  
Small or dim

High BPM  
Brighter glow  
Slightly larger

---

Current Known Issues

Heatmap may appear too strong or too large

Venues not loading correctly shows zero venues

Visual connection between heatmap and venues may not feel clear

---

Edge Cases

No pulses nearby  
Heatmap should appear empty or very faint

Very high pulse density  
Heatmap should not become one solid block

Pulses expiring  
Heatmap should fade smoothly not disappear instantly

---

Performance Considerations

Too many pulses may cause lag

Limit how many pulses are rendered visually

Use simplified heatmap rendering where possible

Avoid re rendering entire map on every update

---

Future Improvements

Better smoothing of heatmap

Dynamic scaling based on zoom level

More accurate venue linking

Heatmap filters such as friends only

---

Connection to Other Features

Pulse System generates the data

Heatmap System displays the data

Map System renders both together

Venue BPM uses pulse data from heatmap

---

Key Insight

Heatmap shows where activity is happening

BPM shows how busy a venue is

Together they give users a clear picture of the night

[[Pulse System  ]]

[[Map System  ]]

[[Core Idea  ]]

[[Core Loop]]
