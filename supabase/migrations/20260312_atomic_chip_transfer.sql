-- ============================================================
-- V21 Audit Fix: Atomic Chip Flow Transfers
-- 
-- Description:
-- `ChipFlowService.transfer` orchestrates all major chip movements
-- (Union -> Club, Club -> Agent, Agent -> Player). Previously, this
-- was a non-atomic TS process that relied on `deduct_player_wallet`
-- followed by `credit_player_wallet`, with a manual TS rollback on fail.
-- A network drop during the rollback would permanently destroy chips.
--
-- This migration provides a dedicated, fully atomic Postgres RPC 
-- for ChipFlowService that executes the debit, credit, and double 
-- audit log synchronously within a single database transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION atomic_chip_transfer(
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_amount NUMERIC,
    p_category TEXT,
    p_description TEXT,
    p_related_entity_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    -- 1. Deduct from sender's PLAYER wallet
    UPDATE wallets 
    SET balance = balance - p_amount, updated_at = NOW()
    WHERE user_id = p_from_user_id AND wallet_type = 'PLAYER' AND balance >= p_amount;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient balance for transfer';
    END IF;
    
    -- 2. Credit to receiver's PLAYER wallet
    INSERT INTO wallets (user_id, wallet_type, balance)
    VALUES (p_to_user_id, 'PLAYER', p_amount)
    ON CONFLICT (user_id, wallet_type) 
    DO UPDATE SET balance = wallets.balance + p_amount, updated_at = NOW();
    
    -- 3. Log audit trail for SENDER (debit)
    INSERT INTO wallet_transactions (
        user_id, type, amount, category, description, related_user_id, reference_id
    ) VALUES (
        p_from_user_id, 'debit', -p_amount, p_category, p_description, p_to_user_id, p_related_entity_id
    );

    -- 4. Log audit trail for RECEIVER (credit)
    INSERT INTO wallet_transactions (
        user_id, type, amount, category, description, related_user_id, reference_id
    ) VALUES (
        p_to_user_id, 'credit', p_amount, p_category, p_description, p_from_user_id, p_related_entity_id
    );

END;
$$;

GRANT EXECUTE ON FUNCTION atomic_chip_transfer(UUID, UUID, NUMERIC, TEXT, TEXT, UUID) TO anon, authenticated;
