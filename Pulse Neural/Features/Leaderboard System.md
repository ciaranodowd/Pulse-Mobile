Purpose

The Leaderboard System ranks venues based on how busy they are using BPM.

It gives users a quick and clear view of the most active venues right now.

It is a fast alternative to exploring the map.

---

Core Behaviour

Venues are ranked from highest BPM to lowest BPM

Higher BPM means more activity and more pulses

The list updates based on live data

---

User Flow

1 User opens Leaderboard tab  
2 App fetches venue data  
3 Venues are sorted by BPM  
4 Top venues are displayed at the top  
5 User scans list to decide where is busy  
6 User may switch to map or pulse

---

Data Source

Uses venue activity data

BPM is calculated using pulse data

Inputs likely include

Number of active pulses  
Recency of pulses  
Frequency of pulses

---

Sorting Logic

Sort venues in descending order by BPM

Highest BPM appears first

If two venues have the same BPM

Use a tie breaker such as most recent activity or fixed order

---

Display Structure

Each venue entry should show

Venue name  
BPM value or activity level  
Visual indicator of activity

Optional display formats

Number based  
Example 72 BPM

Or label based  
Quiet  
Building  
Busy

---

Visual Behaviour

Top venues should stand out

Higher BPM venues may

Appear brighter  
Have stronger glow  
Have slight size emphasis

Lower BPM venues should appear less prominent

---

Connection to Other Features

Pulse System generates activity data

Heatmap System shows area activity

Leaderboard System ranks venues

Map System visualises venue locations

Tonight System shows planned intent

---

Why This Feature Matters

Some users want a quick answer instead of using the map

Leaderboard provides instant clarity

It helps answer

Where is busiest right now

---

Current Risks

If BPM is inaccurate users will lose trust

If all venues have similar BPM the feature loses value

If leaderboard updates too slowly it feels stale

---

Edge Cases

No venue data available

Very low activity across all venues

Multiple venues tied

Handling

If no data show message like

Not enough activity yet

If low activity still show ranking but with low values

---

Performance Considerations

Leaderboard should load quickly

Sorting should be efficient

Avoid heavy UI elements

---

Future Improvements

Show change over time

Example rising or falling venues

Add filtering by venue type

Combine with Tonight data

Highlight trending venues

---

Key Insight

Leaderboard is the fastest way to understand venue ranking

Map is for exploration

Leaderboard is for instant decision

---

Links

[[Pulse System  ]]

[[Heatmap System ]]

[[Map System  ]]

[[Tonight System  ]]

[[Core Idea  ]]

[[Core Loop]]
