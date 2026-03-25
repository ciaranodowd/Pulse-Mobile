Purpose

Tonight System is the feature that asks users if they are going out tonight and captures their intent before the night begins.

It is designed to increase engagement before users physically go out and to show early social momentum.

It helps answer two questions

Are people going out tonight

Where are they planning to go

---

Core Flow

If the user has not already opened the app that day

At around 7pm they receive a notification

Pulse to see where others are going tonight

When the user opens the app from the notification or opens the app normally for the first time that day

A loading screen appears

Then a popup card appears asking

Are you going out tonight

Options

Yes  
No  
Maybe

After the user votes

They see the percentage of users who selected each option

If the user selected Yes or Maybe

A second popup card appears

This lets them pick the venue they are going to

The user can later change their answer by opening the Tonight tab again

---

Main Goals

Encourage users to open the app in the evening

Get a quick read on nightlife intent

Capture planned venue choice before users arrive

Make the app useful before live map activity is high

---

Notification Logic

Send time

Around 7pm

Condition

Only send if the user has not already opened the app that day

Purpose

Bring users into the app before they make plans

Current message

Pulse to see where others are going tonight

---

User Flow

1 User has not opened app yet that day

2 At around 7pm they receive notification

3 User opens app

4 Loading screen appears

5 Going out tonight popup appears

6 User selects Yes No or Maybe

7 Percentages are shown

8 If user selected Yes or Maybe second popup appears

9 User selects venue

10 User can later reopen Tonight tab and change response

---

Question One Logic

Question

Are you going out tonight

Options

Yes  
No  
Maybe

Data captured

User id  
Date  
Response  
Timestamp

Purpose

Measure overall intent for the night

---

Percentage Display Logic

After user votes

Show percentage of users who picked

Yes  
No  
Maybe

This gives immediate social proof and makes the feature feel alive

Percentages should be based on current responses for that night only

---

Question Two Logic

Only shown if user selects Yes or Maybe

Question

Which venue are you going to

User selects a venue from available venue list

Data captured

User id  
Date  
Venue id  
Timestamp  
Initial response yes or maybe

Purpose

Measure planned venue intent

---

Tonight Tab Behaviour

Tonight tab acts as the home of this feature

It should allow the user to

See their current answer  
Change their answer  
Change selected venue if needed  
Review current overall percentages  
Review where people say they are planning to go

---

State Rules

If user selected No

Do not show venue selection card

If user selected Yes or Maybe

Show venue selection card

If user returns later through Tonight tab

Allow them to edit both answers

Only latest answer should count

Only latest venue selection should count

---

Data Model Suggestion

tonight responses

id  
user id  
date  
response yes no maybe  
timestamp updated

tonight venue choices

id  
user id  
date  
venue id  
timestamp updated

You may also combine these into one table later if easier

---

Important Logic Rules

Responses are tied to a specific date

Venue choice should only count for the current night

User should not create duplicate active responses for the same night

If they change answer later only the newest one should be active

---

Connection to Other Features

Tonight System captures planned intent before the night

Pulse System captures live activity during the night

Heatmap System shows active pulse density

Venue BPM may later use both live pulses and tonight intent depending on your formula

---

Why This Feature Matters

This is one of the strongest retention features in the app

It creates a reason to open the app every evening

It turns passive users into contributors

It helps build value even before venue heatmap activity is strong

---

Edge Cases

User opens app before 7pm

Do not send notification later if they already opened app that day

User selects No then changes mind later

Tonight tab should let them update answer

User selects Yes or Maybe but does not pick a venue

Allow them to return and complete it later

Backend fails when saving answer

Show retry option and do not lose local selection if possible

No one has answered yet

Percentages should still display safely or show waiting for more responses

---

Performance Considerations

Popup flow should feel fast

Saving answers should not block the whole app for long

Percentages should load quickly

Avoid making the Tonight flow feel heavy or annoying

---

Future Improvements

Show venue percentages as well

Show trending planned venues

Allow friends only view later

Use tonight intent in venue ranking

Personalised notifications

Cut off responses after a certain time if needed

---

Key Insight

Tonight System measures intention

Pulse System measures live action

Both together create a much stronger picture of the night

---

Links

[[Pulse System  ]]

[[Heatmap System  ]]

[[Map System  ]]

[[Core Idea ]] 
[[Core Loop]]



