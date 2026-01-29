/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚖️ TOS GUARD — Blocks app until Terms of Service accepted
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, ReactNode } from 'react';
import { profileService } from '../../services/ProfileService';
import { useUserStore } from '../../stores/useUserStore';
import TOSAcceptanceModal from './TOSAcceptanceModal';

interface TOSGuardProps {
    children: ReactNode;
}

export default function TOSGuard({ children }: TOSGuardProps) {
    // TEMPORARILY DISABLED - just return children
    return <>{children}</>;
}
