-- ═══════════════════════════════════════════════════════════════════════════════
-- ATOMIC INCREMENT RPCs — Eliminate Read-Modify-Write Race Conditions
-- ═══════════════════════════════════════════════════════════════════════════════
-- These RPCs replace the fallback read-modify-write patterns in RakeService
-- that have inherent race conditions when multiple concurrent hands finish
-- simultaneously for the same player/agent/union.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Increment union total_rake atomically
CREATE OR REPLACE FUNCTION increment_union_rake(
  p_union_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE unions
  SET total_rake = COALESCE(total_rake, 0) + p_amount
  WHERE id = p_union_id;
END;
$$;

-- 2. Increment club_members.rake_generated atomically
CREATE OR REPLACE FUNCTION increment_rake_generated(
  p_club_id UUID,
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE club_members
  SET rake_generated = COALESCE(rake_generated, 0) + p_amount
  WHERE club_id = p_club_id AND user_id = p_user_id;
END;
$$;

-- 3. Increment agents.rake_generated atomically
CREATE OR REPLACE FUNCTION increment_agent_rake(
  p_agent_id UUID,
  p_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE agents
  SET rake_generated = COALESCE(rake_generated, 0) + p_amount
  WHERE id = p_agent_id;
END;
$$;

-- 4. Create financial_alerts table if not exists (for FinancialAlertService persistence)
CREATE TABLE IF NOT EXISTS financial_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'warning',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for admin dashboard queries (unresolved alerts, sorted by recency)
CREATE INDEX IF NOT EXISTS idx_financial_alerts_unresolved
  ON financial_alerts (resolved, created_at DESC)
  WHERE resolved = FALSE;

-- RLS: Only admins/service roles can manage alerts
ALTER TABLE financial_alerts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (SECURITY DEFINER RPCs and server-side)
CREATE POLICY IF NOT EXISTS "financial_alerts_service_role"
  ON financial_alerts FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);
