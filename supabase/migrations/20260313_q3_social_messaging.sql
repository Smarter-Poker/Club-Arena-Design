-- ═══════════════════════════════════════════════════════════════════════════════
--  Q3: Social, Messaging & Discovery — SQL Migration
--  Tables + columns needed for Phase 8-9 features
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Add player status columns to profiles ──
-- These columns support the "Playing At" feature and custom status text
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status_text TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_table TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS current_table_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- Index for fast friend status queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON profiles (is_online) WHERE is_online = TRUE;

-- ── 2. Scheduled Messages table ──
-- Supports club admin message scheduling (Phase 8-9)
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ DEFAULT NULL
);

-- Index for cron job: find pending messages ready to send
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON scheduled_messages (send_at)
  WHERE status = 'pending';

-- RLS: Users can only see/manage their own scheduled messages  
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled messages"
  ON scheduled_messages FOR SELECT
  USING (auth.uid() = sender_id);

CREATE POLICY "Users can insert scheduled messages"
  ON scheduled_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can cancel own scheduled messages"
  ON scheduled_messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id AND status = 'cancelled');

-- ── 3. Add action_url column to notifications ──
-- Supports notification deep-linking (Phase 8)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url TEXT DEFAULT NULL;

-- ── 4. Ensure notifications has required columns ──
-- These should already exist, but ensure for safety
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
