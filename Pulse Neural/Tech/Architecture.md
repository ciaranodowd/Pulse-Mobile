Purpose

Architecture explains how the Pulse app is structured and how its main systems work together.

It gives a high level view of the app so features can be understood, improved, and debugged more easily.

---

Main Layers

Frontend

The frontend is the user facing mobile app

It includes

Map  
Tonight  
Leaderboard  
Profile  
Pulse interaction  
Heatmap display  
Venue visuals  
Notifications  
Popup flows

Backend

The backend stores app data and returns data to the frontend

It handles

Pulse data  
Venue data  
Tonight responses  
Tonight venue choices  
User data  
Activity calculations  
BPM values

Database

The database stores the app state

It includes tables for

Users  
Venues  
Pulses  
Tonight responses  
Tonight venue choices  
Venue stats

---

Current Stack

Frontend  
React Native  
Expo

Backend  
Supabase

Database  
Supabase Postgres

Notifications  
Push notifications through Expo system or related setup

---

Core App Flow

User opens app

Frontend loads current data from backend

Backend returns venue and activity data

Frontend renders map leaderboard tonight and profile data

When user interacts

Frontend sends new data to backend

Backend stores it and updates activity values

Frontend refreshes and shows the new state

---

Feature Relationships

Pulse System

Creates live pulse events

Heatmap System

Displays nearby pulse density

Map System

Displays venues heatmap and venue reactions

Leaderboard System

Ranks venues by BPM

Tonight System

Collects planned intent before the night starts

Profile

Represents the current user and account related data

---

Pulse Flow

User presses Pulse

Frontend triggers animation and haptics

Frontend sends pulse event to backend

Backend stores pulse with location timestamp and linked venue

Backend updates active venue data and BPM related values

Frontend refreshes map heatmap and leaderboard if needed

---

Tonight Flow

If user has not opened app that day

A notification is sent around 7pm

User opens app

Popup asks if they are going out tonight

User answers yes no or maybe

Frontend saves answer to backend

If yes or maybe

Second popup asks which venue they are going to

Frontend saves venue choice

Tonight tab later allows user to review or change answer

---

Leaderboard Flow

Frontend requests venue data

Backend returns venues and BPM values

Frontend sorts if needed or receives already sorted data

Leaderboard displays highest BPM venues first

---

Map Flow

Frontend requests venue list and current activity data

Backend returns venues and active values

Frontend renders venue markers and heatmap

When pulse occurs nearby venue responds visually

---

Data Ownership

Frontend is responsible for

Rendering UI  
Showing animations  
Capturing taps and user actions  
Displaying current state

Backend is responsible for

Saving permanent data  
Returning current data  
Updating venue related values  
Handling logic tied to activity state  
Preventing invalid data where possible

Database is responsible for

Persisting all records  
Supporting queries  
Storing current and historical activity

---

Important Design Principle

The frontend should feel fast and responsive

The backend should be the source of truth

The database should preserve the real state of the system

---

Current Known Issues

Venue fetch can fail and show zero venues

UI can become misleading if backend data is missing

Map quality depends heavily on clean venue data and pulse linking

System documentation previously risked becoming outdated when features changed

---

Main Risks

Too much logic in frontend can create inconsistent state

Too little validation in backend can allow bad data

If BPM depends on bad pulse data leaderboard becomes untrustworthy

If tonight responses and pulse data are not clearly separated the product becomes confusing

---

Debugging Value

This architecture note exists so that when a feature breaks you can ask

Is this a frontend issue  
Is this a backend issue  
Is this a database issue  
Is this a logic issue between systems

That makes debugging much faster

---

Future Improvements

Separate service logic more clearly

Document each table in database note

Document notification logic in more depth

Add auth rules and validation rules

Add better error handling paths

---

Key Insight

Pulse works because multiple systems work together

Pulse is not just one feature

It is a connected product made of input systems display systems and ranking systems

---

Links

[[Pulse System  ]]
[[Heatmap System ]] 
[[Map System  ]]
[[Tonight System  ]]
[[Leaderboard System  ]]
[[Core Idea  ]]
[[Risks]]
