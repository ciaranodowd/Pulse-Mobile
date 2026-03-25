Current understanding

BPM may not exist as a standalone SQL query

It is likely derived from pulses linked to venues

Current pulse flow appears to be

User taps a venue  
Venue card opens  
User presses Pulse here now  
Pulse is written with venue_id  
Venue BPM increases

Problem

This flow has too much friction

It requires too many user actions

This weakens the core loop

Better target flow

User presses one main Pulse button  
Pulse is created at user location  
Nearest venue is assigned automatically  
Nearby density increases  
Venue BPM updates automatically  
Nearby venues react visually

Open questions

Where is venue_id assigned to a pulse

Where is BPM calculated  
In frontend  
In query  
In function  
Or by counting active pulses directly

Which SQL file contains venue boost logic

Likely candidates from current list

Tonight Boosts Counter  
Send Boost Function  
Profile Roles and Venue Boo...

Recommendation

Audit venue boost related SQL next

Do not search for BPM by name only  
Search for  
venue  
boost  
count  
pulses  
update  
where venue_id
