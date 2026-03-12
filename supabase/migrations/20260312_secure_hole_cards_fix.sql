-- ═══════════════════════════════════════════════════════════════════════════════
-- ♠ CLUB ARENA — Secure Hole Cards & God Mode Vulnerability Fix
-- ═══════════════════════════════════════════════════════════════════════════════
-- Blocks a severe security vulnerability where hole cards were leaked over
-- the public WebSocket broadcast. This table secures them with Postgres RLS.

CREATE TABLE IF NOT EXISTS public.table_hole_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
    hand_number BIGINT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seat_number INTEGER NOT NULL,
    cards JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(table_id, hand_number, user_id)
);

ALTER TABLE public.table_hole_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own hole cards" 
ON public.table_hole_cards FOR SELECT TO authenticated 
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE table_hole_cards;

CREATE OR REPLACE FUNCTION cleanup_old_hole_cards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.table_hole_cards WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;
