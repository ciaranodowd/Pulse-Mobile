Current pulse insert behaviour

The app always includes venue_id in the insert payload

However venue_id is set to null when no venue is nearby

This happens in both auto and manual pulse flows

Current insert behaviour

venue_id is venueId or null  
user_id is session user id or null

Pulse sources

auto  
Triggered when location tracking starts  
Fires once immediately  
Then repeats on an interval

manual  
Triggered by user pressing the PULSE HERE button

Current logic summary

If a venue is nearby  
The pulse is linked to that venue

If no venue is nearby  
The pulse is still inserted but with venue_id null

If user is logged in  
user_id is included

If user is not logged in  
user_id is null

Implications

Heatmap can work without a venue

Venue BPM only updates when a pulse has a venue_id

Duplicate protection using user_id venue_id minute_bucket only works when both user_id and venue_id are present

Anonymous pulses or null venue pulses bypass that protection

Current risks

Too many null venue pulses can make heatmap useful but BPM weaker

Null user_id means some anti spam protections do not apply

Auto pulses may inflate activity if not tuned carefully

Key insight

The pulse system already supports automatic nearest venue linking  
So the app is closer to the desired low friction flow than expected

Then also add this to Backend Audit

Pulse Insert Behaviour

Status  
Confirmed current logic

Summary  
venue_id always included in payload but may be null  
user_id always included in payload but may be null  
pulse can be auto or manual

Risk  
dedupe protection fails when user_id or venue_id is null

Big insight

You do not need to redesign everything from scratch.  
You mainly need to tighten the logic.
[[Pulse System  ]]
[[Heatmap System  ]]
[[Leaderboard System  ]]
[[Database]]