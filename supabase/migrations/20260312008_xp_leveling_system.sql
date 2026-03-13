-- 20260312008_xp_leveling_system.sql
-- XP & Leveling system for player progression

BEGIN;

-- Add xp_total column to profiles if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'xp_total'
  ) THEN
    ALTER TABLE profiles ADD COLUMN xp_total INT DEFAULT 0;
  END IF;
END $$;

-- Create XP log table
CREATE TABLE IF NOT EXISTS user_xp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_user_xp_log_user_id ON user_xp_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_xp_log_created_at ON user_xp_log(created_at DESC);

-- RLS: users can read their own XP log
ALTER TABLE user_xp_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own xp log' AND tablename = 'user_xp_log') THEN
    CREATE POLICY "Users can read own xp log" ON user_xp_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- RPC: Atomically award XP to a player
CREATE OR REPLACE FUNCTION award_player_xp(
  p_user_id UUID,
  p_amount INT,
  p_source TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_total INT;
BEGIN
  -- Insert log entry
  INSERT INTO user_xp_log (user_id, amount, source)
  VALUES (p_user_id, p_amount, p_source);

  -- Atomically increment xp_total
  UPDATE profiles
  SET xp_total = COALESCE(xp_total, 0) + p_amount
  WHERE id = p_user_id
  RETURNING xp_total INTO v_new_total;

  RETURN jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'source', p_source,
    'new_total', COALESCE(v_new_total, 0)
  );
END;
$$;

COMMIT;
