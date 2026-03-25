// supabase/functions/notify-boost/index.ts
// Supabase Edge Function — triggered by the client after a successful send_boost RPC.
// Fetches all user push tokens and sends Expo push notifications.
//
// Deploy:  supabase functions deploy notify-boost
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOOST_TYPE_LABELS: Record<string, string> = {
  drinks_deal:    "Drinks Deal",
  free_entry:     "Free Entry",
  event_starting: "Live Now",
  quiet_now:      "Quiet Now",
  custom:         "Special",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { boostId } = await req.json();
    if (!boostId) {
      return new Response(JSON.stringify({ error: "boostId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Fetch the boost ────────────────────────────────────────────────────
    const { data: boost, error: boostErr } = await supabase
      .from("boosts")
      .select("*")
      .eq("id", boostId)
      .single();

    if (boostErr || !boost) {
      return new Response(JSON.stringify({ error: "Boost not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if already expired
    if (new Date(boost.expires_at) <= new Date()) {
      return new Response(JSON.stringify({ sent: 0, reason: "expired" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch all normal_user push tokens ─────────────────────────────────
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("push_token")
      .eq("role", "normal_user")
      .not("push_token", "is", null);

    if (profErr || !profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokens = profiles
      .map((p: { push_token: string | null }) => p.push_token)
      .filter((t): t is string => !!t && t.startsWith("ExponentPushToken["));

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no valid expo tokens" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typeLabel = BOOST_TYPE_LABELS[boost.boost_type] || "Special";

    // ── Build Expo push messages ───────────────────────────────────────────
    const messages = tokens.map((token) => ({
      to:    token,
      sound: "default",
      title: `${boost.venue_name} — ${typeLabel}`,
      body:  boost.message,
      data:  {
        screen:  "plans",
        boostId: boost.id,
        venueId: boost.venue_id,
      },
      ttl:       boost.duration_minutes * 60, // don't deliver after boost expires
      priority:  "high",
    }));

    // ── Send in batches of 100 (Expo limit) ────────────────────────────────
    let totalSent = 0;
    const BATCH = 100;
    for (let i = 0; i < messages.length; i += BATCH) {
      const chunk = messages.slice(i, i + BATCH);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method:  "POST",
        headers: {
          "Accept":           "application/json",
          "Accept-encoding":  "gzip, deflate",
          "Content-Type":     "application/json",
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) totalSent += chunk.length;
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
