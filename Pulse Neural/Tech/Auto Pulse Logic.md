Purpose

Auto Pulse Logic defines how the app automatically creates pulses in the background while the app is running.

This helps keep the app live without requiring constant manual user interaction.

---

Trigger


Auto pulse starts when the app mounts and the user is logged in

It does not run for logged out users

---

Actual Code

useEffect(() => {  
let mounted = true;

const start = async () => {  
try {  
setStatus("Requesting location permission...");  
const { status: perm } = await Location.requestForegroundPermissionsAsync();

  if (perm !== "granted") {  
    setStatus("Location permission denied");  
    return;  
  }  
  
  setStatus("Getting location...");  
  const fix = await getOneLocationFix();  
  if (!mounted) return;  
  
  setLocation(fix);  
  setStatus("Live");  
  
  const nearVenue0 = nearestVenueWithinRadius(  
    fix.latitude,  
    fix.longitude,  
    venuesRef.current,  
    PULSE_VENUE_LINK_RADIUS  
  );  
  
  await addPulseToDb({  
    lat: fix.latitude,  
    lon: fix.longitude,  
    source: "auto",  
    venueId: nearVenue0?.id ?? null,  
  });  
  
  timerRef.current = setInterval(async () => {  
    try {  
      const f = await getOneLocationFix();  
      setLocation(f);  
  
      const nearVenue = nearestVenueWithinRadius(  
        f.latitude,  
        f.longitude,  
        venuesRef.current,  
        PULSE_VENUE_LINK_RADIUS  
      );  
  
      await addPulseToDb({  
        lat: f.latitude,  
        lon: f.longitude,  
        source: "auto",  
        venueId: nearVenue?.id ?? null,  
      });  
    } catch {}  
  }, AUTO_PULSE_EVERY_MS);  
} catch (e) {  
  setStatus(`Error: ${String(e?.message || e)}`);  
}

};

if (session?.user) start();

return () => {  
mounted = false;  
if (timerRef.current) clearInterval(timerRef.current);  
};  
}, [session?.user?.id, profile?.age_bracket]);

---

Timing

Auto pulse fires once immediately after initial location is resolved

Then repeats every 90 seconds

AUTO_PULSE_EVERY_MS equals 90000

---

Conditions

User must be logged in

Location permission must be granted

App must remain mounted

If the user logs in or out  
or the age bracket changes  
the effect restarts

---

Venue Linking Rule

Auto pulse links to the nearest venue within 150 metres

If no venue is found within radius  
venue_id is null

---

What Auto Pulse Affects

Heatmap  
Venue activity if venue linked  
Leaderboard if venue linked and inside BPM window  
Going now if venue linked and user linked and not expired

---

Strengths

Keeps the app feeling active  
Reduces need for constant manual pulsing  
Uses the same venue linking logic as manual pulses  
Supports live nightlife picture

---

Risks

90 second auto pulse may inflate activity if not tuned carefully

Logged out users do not contribute auto pulses

If venue fetch fails or venue list is weak  
auto linking becomes weaker

If too many auto pulses exist  
manual pulses may feel less meaningful

---

Design Implications

Your app already supports a much lower friction activity model than it first seemed

Manual pulsing is not the only source of activity

Auto pulses are a major part of the live data system

This means any future BPM tuning must account for the balance between auto and manual pulses

---

Future Improvements

Tune the 90 second interval

Consider weighting manual and auto pulses differently

Consider pausing auto pulses in some contexts

Document exact cleanup strategy for expired auto pulses

---

Key Insight

Auto Pulse Logic is one of the main engines behind the live feel of the app

It continuously feeds new pulse data into the system as long as the user is logged in and the app is active

---

Links

[[Pulse Insert Logic ]] 
[[Active Pulse Logic  ]]
[[Venue Linking Logic  ]]
[[Realtime Logic  ]]
[[Venue And BPM Logic  ]]
[[Database]]
