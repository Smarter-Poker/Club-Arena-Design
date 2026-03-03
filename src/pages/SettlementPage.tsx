/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CLUB ENGINE — Settlement Page with Live Updates
 * ═══════════════════════════════════════════════════════════════════════════════
 * Weekly settlement management for clubs and unions
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { SettlementService } from '../services/SettlementService';
import styles from './SettlementPage.module.css';
import { useToast } from '../components/common/Toast';
import ClubBottomNav from '../components/club/ClubBottomNav';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SettlementPeriod {
    id: string;
    periodNumber: number;
    year: number;
    startAt: string;
    endAt: string;
    status: 'open' | 'processing' | 'settled';
    totalRake: number;
    totalBBJ: number;
    totalHands: number;
    totalPlayers: number;
}

interface ClubWire {
    clubId: string;
    clubName: string;
    netPlayerPL: number;
    grossRake: number;
    unionTax: number;
    agentCommissions: number;
    finalWire: number;
    direction: 'PAY_TO_UNION' | 'COLLECT_FROM_UNION';
    status: 'pending' | 'processed';
}

interface AgentPayout {
    agentId: string;
    agentName: string;
    rakeGenerated: number;
    commissionRate: number;
    grossCommission: number;
    playerRakeback: number;
    netPayout: number;
    status: 'pending' | 'approved' | 'paid';
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

type TabType = 'overview' | 'club-wires' | 'agent-payouts' | 'history';

export default function SettlementPage() {
    const { unionId, clubId } = useParams<{ unionId?: string; clubId?: string }>();
    const navigate = useNavigate();
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isLoading, setIsLoading] = useState(true);

    // Real data from SettlementService
    const [periods, setPeriods] = useState<SettlementPeriod[]>([]);
    const [selectedPeriod, setSelectedPeriod] = useState<SettlementPeriod | null>(null);
    const [clubWires, setClubWires] = useState<ClubWire[]>([]);
    const [agentPayouts, setAgentPayouts] = useState<AgentPayout[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Load data from SettlementService
    useEffect(() => {
        async function loadSettlementData() {
            setIsLoading(true);
            try {
                // Get current period
                const currentPeriod = await SettlementService.getCurrentPeriod();

                // Get period history
                const periodHistory = await SettlementService.getPeriodHistory(12);

                // Map to our internal format
                const mappedPeriods: SettlementPeriod[] = [
                    {
                        id: currentPeriod.id,
                        periodNumber: currentPeriod.periodNumber,
                        year: currentPeriod.year,
                        startAt: currentPeriod.startAt,
                        endAt: currentPeriod.endAt,
                        status: currentPeriod.status as 'open' | 'processing' | 'settled',
                        totalRake: currentPeriod.totalRakeCollected,
                        totalBBJ: currentPeriod.totalBBJContributions,
                        totalHands: currentPeriod.totalHandsDealt,
                        totalPlayers: 0, // Not in service type
                    },
                    ...periodHistory.map(p => ({
                        id: p.id,
                        periodNumber: p.periodNumber,
                        year: p.year,
                        startAt: p.startAt,
                        endAt: p.endAt,
                        status: p.status as 'open' | 'processing' | 'settled',
                        totalRake: p.totalRakeCollected,
                        totalBBJ: p.totalBBJContributions,
                        totalHands: p.totalHandsDealt,
                        totalPlayers: 0,
                    })),
                ];

                setPeriods(mappedPeriods);
                setSelectedPeriod(mappedPeriods[0]);

                // Generate settlements for current period
                const settlements = await SettlementService.generateSettlements(currentPeriod.id);

                // Map club settlements to wires
                const wires: ClubWire[] = settlements.clubSettlements.map(c => ({
                    clubId: c.clubId,
                    clubName: c.clubName,
                    // Calculate net player P/L as inverse of rake collected (players lost this to rake)
                    netPlayerPL: -(c.totalRakeCollected),
                    grossRake: c.totalRakeCollected,
                    unionTax: c.platformFee,
                    agentCommissions: c.agentCommissions,
                    finalWire: c.netRevenue,
                    direction: c.netRevenue >= 0 ? 'COLLECT_FROM_UNION' : 'PAY_TO_UNION',
                    status: c.status === 'finalized' ? 'processed' : 'pending',
                }));
                setClubWires(wires);

                // Map agent settlements to payouts
                const payouts: AgentPayout[] = settlements.agentSettlements.map(a => ({
                    agentId: a.agentId,
                    agentName: a.agentName,
                    rakeGenerated: a.totalRakeGenerated,
                    commissionRate: a.commissionRate,
                    grossCommission: a.commissionEarned,
                    // Calculate player rakeback as portion of rake returned to players (typically 10-20%)
                    playerRakeback: a.totalRakeGenerated * 0.10, // 10% default rakeback
                    netPayout: a.netSettlement,
                    status: a.status as 'pending' | 'approved' | 'paid',
                }));
                setAgentPayouts(payouts);

            } catch (error) {
                console.error('[SettlementPage] Failed to load data:', error);
                toast.error('Failed to load settlement data');
            } finally {
                setIsLoading(false);
            }
        }

        loadSettlementData();

        // Real-time settlement period updates
        const channel = supabase
            .channel('settlement-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'settlement_periods',
                },
                () => {
                    loadSettlementData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [unionId]);

    // Calculate totals
    const totalToCollect = clubWires
        .filter(w => w.direction === 'PAY_TO_UNION')
        .reduce((sum, w) => sum + Math.abs(w.finalWire), 0);
    const totalToDistribute = clubWires
        .filter(w => w.direction === 'COLLECT_FROM_UNION')
        .reduce((sum, w) => sum + w.finalWire, 0);
    const netPosition = totalToDistribute - totalToCollect;
    const totalAgentPayouts = agentPayouts.reduce((sum, a) => sum + a.netPayout, 0);

    const formatMoney = (amount: number) => {
        const prefix = amount < 0 ? '-$' : '$';
        return prefix + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const handleExecutePayouts = async () => {
        if (!selectedPeriod) return;

        setIsProcessing(true);
        // Capture period ref to avoid stale closure race
        const period = selectedPeriod;
        try {
            // Execute real payouts via SettlementService
            const result = await SettlementService.executeMondayPayouts(period.id);

            // Only update state if payouts succeeded
            if (result.agentsPaid > 0 || result.playersWithRakeback > 0) {
                setAgentPayouts(prev => prev.map(a => ({ ...a, status: 'paid' as const })));
                setClubWires(prev => prev.map(w => ({ ...w, status: 'processed' as const })));
                toast.success(`Payouts complete: ${result.agentsPaid} agents, ${result.playersWithRakeback} players, $${result.totalDisbursed.toLocaleString()} disbursed`);
            }
        } catch (error) {
            console.error('[SettlementPage] Payout failed:', error);
            toast.error('Payout execution failed: ' + (error as Error).message);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <div className={styles.page}>
                <div className={styles.loading}>Loading settlement data...</div>
            </div>
        );
    }

    if (!selectedPeriod) {
        return (
            <div className={styles.page}>
                <div className={styles.error}>No settlement periods found</div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <button className={styles.backButton} onClick={() => navigate(-1)}>
                    ← Back
                </button>
                <div className={styles.headerContent}>
                    <h1>Settlement Center</h1>
                    <p className={styles.subtitle}>
                        Period {selectedPeriod.periodNumber}/{selectedPeriod.year} • {formatDate(selectedPeriod.startAt)} - {formatDate(selectedPeriod.endAt)}
                    </p>
                </div>
                <div className={`${styles.statusBadge} ${styles[selectedPeriod.status]}`}>
                    {selectedPeriod.status === 'open' && ' Open'}
                    {selectedPeriod.status === 'processing' && '🟡 Processing'}
                    {selectedPeriod.status === 'settled' && ' Settled'}
                </div>
            </header>

            {/* Key Metrics */}
            <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                    <span className={styles.metricIcon}></span>
                    <div>
                        <span className={styles.metricValue}>{formatMoney(selectedPeriod.totalRake)}</span>
                        <span className={styles.metricLabel}>Total Rake</span>
                    </div>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricIcon}></span>
                    <div>
                        <span className={styles.metricValue}>{formatMoney(selectedPeriod.totalBBJ)}</span>
                        <span className={styles.metricLabel}>BBJ Collected</span>
                    </div>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricIcon}></span>
                    <div>
                        <span className={styles.metricValue}>{selectedPeriod.totalHands.toLocaleString()}</span>
                        <span className={styles.metricLabel}>Hands Dealt</span>
                    </div>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricIcon}></span>
                    <div>
                        <span className={styles.metricValue}>{selectedPeriod.totalPlayers.toLocaleString()}</span>
                        <span className={styles.metricLabel}>Active Players</span>
                    </div>
                </div>
            </div>

            {/* Settlement Summary */}
            <div className={styles.settlementSummary}>
                <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Clubs Owe Union</span>
                    <span className={`${styles.summaryValue} ${styles.negative}`}>{formatMoney(totalToCollect)}</span>
                </div>
                <div className={styles.summaryDivider}>⟷</div>
                <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Union Owes Clubs</span>
                    <span className={`${styles.summaryValue} ${styles.positive}`}>{formatMoney(totalToDistribute)}</span>
                </div>
                <div className={styles.summaryDivider}>=</div>
                <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Net Position</span>
                    <span className={`${styles.summaryValue} ${netPosition >= 0 ? styles.positive : styles.negative}`}>
                        {formatMoney(netPosition)}
                    </span>
                </div>
            </div>

            {/* Tab Navigation */}
            <nav className={styles.tabNav}>
                {(['overview', 'club-wires', 'agent-payouts', 'history'] as TabType[]).map(tab => (
                    <button
                        key={tab}
                        className={`${styles.tabButton} ${activeTab === tab ? styles.active : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'overview' && ' Overview'}
                        {tab === 'club-wires' && ' Club Wires'}
                        {tab === 'agent-payouts' && ' Agent Payouts'}
                        {tab === 'history' && ' History'}
                    </button>
                ))}
            </nav>

            {/* Tab Content */}
            <div className={styles.content}>
                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {/* OVERVIEW TAB */}
                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {activeTab === 'overview' && (
                    <div className={styles.overviewSection}>
                        <div className={styles.formulaCard}>
                            <h3> Settlement Formula</h3>
                            <div className={styles.formula}>
                                <code>FINAL WIRE = (Net Player P/L) + (Gross Rake) - (Union Tax 10%)</code>
                            </div>
                            <p className={styles.formulaNote}>
                                Positive wire → Union pays Club<br />
                                Negative wire → Club pays Union
                            </p>
                        </div>

                        <div className={styles.timelineCard}>
                            <h3> Settlement Timeline</h3>
                            <div className={styles.timeline}>
                                <div className={`${styles.timelineItem} ${styles.completed}`}>
                                    <span className={styles.timelineDot}></span>
                                    <div>
                                        <strong>Week Start</strong>
                                        <p>Monday 12:00 AM UTC</p>
                                    </div>
                                </div>
                                <div className={`${styles.timelineItem} ${styles.active}`}>
                                    <span className={styles.timelineDot}>●</span>
                                    <div>
                                        <strong>Active Settlement</strong>
                                        <p>Rake & P/L tracking in progress</p>
                                    </div>
                                </div>
                                <div className={styles.timelineItem}>
                                    <span className={styles.timelineDot}>○</span>
                                    <div>
                                        <strong>Sunday Snapshot</strong>
                                        <p>11:59:59 PM PST — Invoice generation</p>
                                    </div>
                                </div>
                                <div className={styles.timelineItem}>
                                    <span className={styles.timelineDot}>○</span>
                                    <div>
                                        <strong>Monday Payouts</strong>
                                        <p>4:00 AM PST — Commission injection</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedPeriod.status === 'open' && (
                            <div className={styles.actionBar}>
                                <button
                                    className={styles.executeButton}
                                    onClick={handleExecutePayouts}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? ' Processing...' : ' Execute Settlement'}
                                </button>
                                <p className={styles.actionNote}>
                                    This will finalize all wires and process agent payouts
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {/* CLUB WIRES TAB */}
                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {activeTab === 'club-wires' && (
                    <div className={styles.wiresSection}>
                        <table className={styles.wireTable}>
                            <thead>
                                <tr>
                                    <th>Club</th>
                                    <th>Net Player P/L</th>
                                    <th>Gross Rake</th>
                                    <th>Union Tax (10%)</th>
                                    <th>Agent Comm.</th>
                                    <th>Final Wire</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clubWires.map(wire => (
                                    <tr key={wire.clubId}>
                                        <td className={styles.clubCell}>{wire.clubName}</td>
                                        <td className={wire.netPlayerPL >= 0 ? styles.positive : styles.negative}>
                                            {formatMoney(wire.netPlayerPL)}
                                        </td>
                                        <td>{formatMoney(wire.grossRake)}</td>
                                        <td className={styles.muted}>-{formatMoney(wire.unionTax)}</td>
                                        <td className={styles.muted}>-{formatMoney(wire.agentCommissions)}</td>
                                        <td className={`${styles.wireAmount} ${wire.finalWire >= 0 ? styles.positive : styles.negative}`}>
                                            {formatMoney(wire.finalWire)}
                                            <span className={styles.wireDirection}>
                                                {wire.direction === 'COLLECT_FROM_UNION' ? '← Union Pays' : '→ Club Pays'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`${styles.badge} ${styles[wire.status]}`}>
                                                {wire.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {/* AGENT PAYOUTS TAB */}
                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {activeTab === 'agent-payouts' && (
                    <div className={styles.payoutsSection}>
                        <div className={styles.payoutSummary}>
                            <span>Total Agent Payouts This Period:</span>
                            <strong className={styles.positive}>{formatMoney(totalAgentPayouts)}</strong>
                        </div>

                        <table className={styles.payoutTable}>
                            <thead>
                                <tr>
                                    <th>Agent</th>
                                    <th>Rake Generated</th>
                                    <th>Commission Rate</th>
                                    <th>Gross Commission</th>
                                    <th>Player Rakeback</th>
                                    <th>Net Payout</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agentPayouts.map(payout => (
                                    <tr key={payout.agentId}>
                                        <td className={styles.agentCell}>{payout.agentName}</td>
                                        <td>{formatMoney(payout.rakeGenerated)}</td>
                                        <td>{(payout.commissionRate * 100).toFixed(0)}%</td>
                                        <td>{formatMoney(payout.grossCommission)}</td>
                                        <td className={styles.muted}>-{formatMoney(payout.playerRakeback)}</td>
                                        <td className={`${styles.netAmount} ${styles.positive}`}>
                                            {formatMoney(payout.netPayout)}
                                        </td>
                                        <td>
                                            <span className={`${styles.badge} ${styles[payout.status]}`}>
                                                {payout.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className={styles.payoutNote}>
                            <p>
                                <strong>Net Payout</strong> = Gross Commission - Player Rakeback (the spread agent keeps)
                            </p>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {/* HISTORY TAB */}
                {/* ═══════════════════════════════════════════════════════════════════════════════ */}
                {activeTab === 'history' && (
                    <div className={styles.historySection}>
                        <div className={styles.periodList}>
                            {periods.map(period => (
                                <div
                                    key={period.id}
                                    className={`${styles.periodCard} ${selectedPeriod?.id === period.id ? styles.selected : ''}`}
                                    onClick={() => setSelectedPeriod(period)}
                                >
                                    <div className={styles.periodHeader}>
                                        <span className={styles.periodNumber}>Week {period.periodNumber}</span>
                                        <span className={`${styles.badge} ${styles[period.status]}`}>
                                            {period.status}
                                        </span>
                                    </div>
                                    <p className={styles.periodDates}>
                                        {formatDate(period.startAt)} - {formatDate(period.endAt)}
                                    </p>
                                    <div className={styles.periodStats}>
                                        <span>{formatMoney(period.totalRake)} rake</span>
                                        <span>•</span>
                                        <span>{period.totalHands.toLocaleString()} hands</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Navigation */}
            {clubId && <ClubBottomNav clubId={clubId} />}
        </div>
    );
}
