-- ═══════════════════════════════════════════════════════════════════════════
-- Pulse: Boost Notifications — Database Migration
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend profiles table ─────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text
    NOT NULL DEFAULT 'normal_user'
    CHECK (role IN ('normal_user', 'venue_business')),
  ADD COLUMN IF NOT EXISTS managed_venue_id   text,
  ADD COLUMN IF NOT EXISTS managed_venue_name text,
  ADD COLUMN IF NOT EXISTS push_token         text;

-- ── 2. boosts table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boosts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         text        NOT NULL,
  venue_name       text        NOT NULL,
  business_user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boost_type       text        NOT NULL
    CHECK (boost_type IN ('drinks_deal','free_entry','event_starting','quiet_now','custom')),
  message          text        NOT NULL
    CHECK (char_length(message) BETWEEN 1 AND 80),
  duration_minutes integer     NOT NULL
    CHECK (duration_minutes IN (15, 30, 45, 60)),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  is_active        boolean     NOT NULL DEFAULT true
);

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS boosts_venue_id_idx      ON boosts (venue_id);
CREATE INDEX IF NOT EXISTS boosts_is_active_idx     ON boosts (is_active);
CREATE INDEX IF NOT EXISTS boosts_expires_at_idx    ON boosts (expires_at);
CREATE INDEX IF NOT EXISTS boosts_created_at_idx    ON boosts (created_at);
CREATE INDEX IF NOT EXISTS boosts_business_user_idx ON boosts (business_user_id);
CREATE INDEX IF NOT EXISTS boosts_active_venue_idx  ON boosts (venue_id, is_active, expires_at);

-- ── 4. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_active_boosts"
  ON boosts FOR SELECT
  USING (is_active = true AND expires_at > now());

CREATE POLICY "business_read_own_boosts"
  ON boosts FOR SELECT
  USING (auth.uid() = business_user_id);

-- ── 5. RPC: send_boost ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_boost(
  p_venue_id         text,
  p_venue_name       text,
  p_boost_type       text,
  p_message          text,
  p_duration_minutes integer
)
RETURNS json
AS $$
DECLARE
  v_caller_id      uuid := auth.uid();
  v_caller_role    text;
  v_managed_venue  text;
  v_boost_count    integer;
  v_cooldown_count integer;
  v_night_start    timestamptz;
  v_night_end      timestamptz;
  v_new_id         uuid;
BEGIN
  SELECT role, managed_venue_id
    INTO v_caller_role, v_managed_venue
    FROM profiles
   WHERE id = v_caller_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found.';
  END IF;

  IF v_caller_role <> 'venue_business' THEN
    RAISE EXCEPTION 'Only venue business accounts can send boosts.';
  END IF;

  IF v_managed_venue IS NULL OR v_managed_venue <> p_venue_id THEN
    RAISE EXCEPTION 'You can only send boosts for your managed venue.';
  END IF;

  IF p_message IS NULL OR char_length(trim(p_message)) = 0 THEN
    RAISE EXCEPTION 'Message is required.';
  END IF;

  IF char_length(p_message) > 80 THEN
    RAISE EXCEPTION 'Message must be 80 characters or fewer.';
  END IF;

  IF p_boost_type NOT IN ('drinks_deal','free_entry','event_starting','quiet_now','custom') THEN
    RAISE EXCEPTION 'Invalid boost type.';
  END IF;

  IF p_duration_minutes NOT IN (15, 30, 45, 60) THEN
    RAISE EXCEPTION 'Duration must be 15, 30, 45, or 60 minutes.';
  END IF;

  v_night_start := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_night_end   := v_night_start + interval '1 day';

  SELECT count(*) INTO v_boost_count
    FROM boosts
   WHERE venue_id   = p_venue_id
     AND created_at >= v_night_start
     AND created_at <  v_night_end;

  IF v_boost_count >= 2 THEN
    RAISE EXCEPTION 'This venue has already sent 2 boosts tonight. Limit resets at midnight UTC.';
  END IF;

  SELECT count(*) INTO v_cooldown_count
    FROM boosts
   WHERE venue_id   = p_venue_id
     AND message    = p_message
     AND created_at > now() - interval '5 minutes';

  IF v_cooldown_count > 0 THEN
    RAISE EXCEPTION 'This message was sent in the last 5 minutes. Please wait before resending.';
  END IF;

  INSERT INTO boosts (
    venue_id, venue_name, business_user_id,
    boost_type, message,
    duration_minutes, expires_at
  ) VALUES (
    p_venue_id, p_venue_name, v_caller_id,
    p_boost_type, p_message,
    p_duration_minutes,
    now() + (p_duration_minutes || ' minutes')::interval
  )
  RETURNING id INTO v_new_id;

  RETURN json_build_object('id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Helper RPC: get_tonight_boost_count ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_tonight_boost_count(p_venue_id text)
RETURNS integer
AS $$
DECLARE
  v_count       integer;
  v_night_start timestamptz;
  v_night_end   timestamptz;
BEGIN
  v_night_start := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_night_end   := v_night_start + interval '1 day';

  SELECT count(*) INTO v_count
    FROM boosts
   WHERE venue_id   = p_venue_id
     AND created_at >= v_night_start
     AND created_at <  v_night_end;

  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── How to promote a user to venue_business (run manually per account) ────────
-- UPDATE profiles
--    SET role               = 'venue_business',
--        managed_venue_id   = 'node-12345',
--        managed_venue_name = 'Electric'
--  WHERE id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
