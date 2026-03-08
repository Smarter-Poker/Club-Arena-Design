-- =============================================
-- Missing tables and RPC functions
-- hand_history, rake_history, increment_rake_generated, fn_toggle_message_reaction
-- =============================================

-- 1. hand_history table
CREATE TABLE IF NOT EXISTS hand_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID,
  tournament_id UUID,
  hand_number INTEGER NOT NULL,
  game_variant TEXT NOT NULL DEFAULT 'nlh',
  small_blind DECIMAL(12,2) NOT NULL DEFAULT 0,
  big_blind DECIMAL(12,2) NOT NULL DEFAULT 0,
  pot_size DECIMAL(12,2) NOT NULL DEFAULT 0,
  rake_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  community_cards TEXT[],
  winners JSONB,
  players JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hand_history_table ON hand_history(table_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_tournament ON hand_history(tournament_id);
CREATE INDEX IF NOT EXISTS idx_hand_history_created ON hand_history(created_at DESC);

-- 2. rake_history table
CREATE TABLE IF NOT EXISTS rake_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID,
  club_id UUID,
  hand_number INTEGER,
  rake_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  pot_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  bbj_drop DECIMAL(12,2) NOT NULL DEFAULT 0,
  promo_drop DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rake_history_table ON rake_history(table_id);
CREATE INDEX IF NOT EXISTS idx_rake_history_club ON rake_history(club_id);
CREATE INDEX IF NOT EXISTS idx_rake_history_created ON rake_history(created_at DESC);

-- 3. increment_rake_generated RPC
CREATE OR REPLACE FUNCTION increment_rake_generated(
  p_club_id UUID,
  p_user_id UUID,
  p_amount DECIMAL
) RETURNS VOID AS $$
BEGIN
  UPDATE club_members
  SET rake_generated = COALESCE(rake_generated, 0) + p_amount,
      updated_at = NOW()
  WHERE club_id = p_club_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. fn_toggle_message_reaction (alias for toggle_message_reaction)
CREATE OR REPLACE FUNCTION fn_toggle_message_reaction(
  p_message_id UUID,
  p_user_id UUID,
  p_emoji TEXT
) RETURNS JSONB AS $$
DECLARE
  v_existing UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_existing FROM message_reactions
  WHERE message_id = p_message_id AND user_id = p_user_id AND emoji = p_emoji;
  IF v_existing IS NOT NULL THEN
    DELETE FROM message_reactions WHERE id = v_existing;
    v_result := jsonb_build_object('action', 'removed', 'emoji', p_emoji);
  ELSE
    INSERT INTO message_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, p_user_id, p_emoji);
    v_result := jsonb_build_object('action', 'added', 'emoji', p_emoji);
  END IF;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Expanded wallet_transactions category constraint
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_category_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_category_check
CHECK (category IN (
  'buyin', 'cashout', 'promo', 'rake', 'transfer',
  'tournament_buyin', 'tournament_winnings', 'tournament_cashout',
  'horse_refill', 'deposit', 'withdrawal', 'refund', 'bbj', 'bonus'
));
