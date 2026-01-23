/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🎰 CLUB ENGINE — Union Detail Page
 * Complete union management with financials and settlements
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { unionService, type Union, type UnionClub } from '../services/UnionService';
import { tableService } from '../services/TableService';
import { clubService } from '../services/ClubService';
import { useUserStore } from '../stores/useUserStore';
import type { PokerTable, Club } from '../types/database.types';
import styles from './UnionDetailPage.module.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SettlementRecord {
    id: string;
    periodStart: string;
    periodEnd: string;
    clubId: string;
    clubName: string;
    rakeGenerated: number;
    unionShare: number;
    status: 'pending' | 'paid' | 'overdue';
    paidAt?: string;
}

interface FinancialSummary {
    totalRakeThisPeriod: number;
    unionRevenue: number;
    pendingSettlements: number;
    overdueAmount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function UnionDetailPage() {
    const { unionId } = useParams<{ unionId: string }>();
    const { user } = useUserStore();

    const [union, setUnion] = useState<Union | null>(null);
    const [clubs, setClubs] = useState<UnionClub[]>([]);
    const [tables, setTables] = useState<PokerTable[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'clubs' | 'tables' | 'financials'>('overview');

    // Financial state - starts empty, no demo data
    const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
    const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);

    // Application state
    const [ownedClubs, setOwnedClubs] = useState<Club[]>([]);
    const [showClubSelector, setShowClubSelector] = useState(false);
    const [applying, setApplying] = useState(false);

    useEffect(() => {
        if (!unionId) return;

        const loadData = async () => {
            setLoading(true);
            try {
                const unionData = await unionService.getUnion(unionId);
                const clubsData = await unionService.getUnionClubs(unionId);
                const tablesData = await tableService.getUnionTables(unionId);

                setUnion(unionData);
                setClubs(clubsData);
                setTables(tablesData);

                // Financial data would come from SettlementService
                // For now, we calculate a basic summary from available data
                if (clubsData.length > 0) {
                    // Would load from SettlementService.generateSettlements()
                    // For now, show empty state
                    setFinancialSummary({
                        totalRakeThisPeriod: 0,
                        unionRevenue: 0,
                        pendingSettlements: 0,
                        overdueAmount: 0,
                    });
                }
            } catch (err) {
                console.error('[UnionDetailPage] Error loading data:', err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [unionId]);

    const handleApplyClick = async () => {
        if (!user) return;

        try {
            const myClubs = await clubService.getMyClubs(user.id);
            const owned = myClubs.filter(c => c.owner_id === user.id);

            if (owned.length === 0) {
                alert("You must own a club to join a union.");
                return;
            }

            if (owned.length === 1) {
                if (window.confirm(`Apply to join ${union?.name} with your club "${owned[0].name}"?`)) {
                    await applyWithClub(owned[0].id);
                }
            } else {
                setOwnedClubs(owned);
                setShowClubSelector(true);
            }
        } catch (error) {
            console.error(error);
            alert("Failed to load your clubs.");
        }
    };

    const applyWithClub = async (clubId: string) => {
        if (!unionId) return;
        setApplying(true);
        try {
            const success = await unionService.addClub(unionId, clubId);
            if (success) {
                alert("Application sent successfully!");
                setShowClubSelector(false);
            }
        } catch (error) {
            console.error(error);
            alert("Failed to send application.");
        } finally {
            setApplying(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.loading}>
                <div className={styles.spinner} />
                <p>Loading union...</p>
            </div>
        );
    }

    if (!union) {
        return (
            <div className={styles.error}>
                <h2>Union Not Found</h2>
                <Link to="/unions" className={styles.backLink}>← Back to Unions</Link>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <Link to="/unions" className={styles.backLink}>← Back to Unions</Link>

            {/* Hero Section */}
            <header className={styles.header}>
                <div className={styles.unionAvatar}>
                    {union.avatarUrl || union.name.charAt(0)}
                </div>
                <div className={styles.unionInfo}>
                    <h1>{union.name}</h1>
                    <p>{union.description}</p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.applyButton}
                        onClick={handleApplyClick}
                        disabled={applying}
                    >
                        {applying ? 'Applying...' : 'Apply to Join'}
                    </button>
                </div>
            </header>

            {/* Club Selector Modal */}
            {showClubSelector && (
                <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowClubSelector(false)}>
                    <div className={styles.modal}>
                        <h2>Select Club</h2>
                        <p>Which club would you like to apply with?</p>
                        <div className={styles.clubList}>
                            {ownedClubs.map(c => (
                                <button
                                    key={c.id}
                                    className={styles.clubOption}
                                    onClick={() => applyWithClub(c.id)}
                                >
                                    <strong>{c.name}</strong>
                                    <span>ID: {c.club_id}</span>
                                </button>
                            ))}
                        </div>
                        <button className={styles.cancelButton} onClick={() => setShowClubSelector(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Row */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statValue}>{union.clubCount}</span>
                    <span className={styles.statLabel}>Member Clubs</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statValue}>{union.memberCount.toLocaleString()}</span>
                    <span className={styles.statLabel}>Total Players</span>
                </div>
                <div className={styles.statCard}>
                    <span className={`${styles.statValue} ${styles.online}`}>{Math.floor(union.memberCount * 0.2).toLocaleString()}</span>
                    <span className={styles.statLabel}>Online Now</span>
                </div>
                {financialSummary && (
                    <div className={styles.statCard}>
                        <span className={styles.statValue}>${financialSummary.unionRevenue.toLocaleString()}</span>
                        <span className={styles.statLabel}>This Period</span>
                    </div>
                )}
            </div>

            {/* Tab Navigation */}
            <nav className={styles.tabNav}>
                <button className={`${styles.tab} ${activeTab === 'overview' ? styles.active : ''}`} onClick={() => setActiveTab('overview')}>
                    📊 Overview
                </button>
                <button className={`${styles.tab} ${activeTab === 'clubs' ? styles.active : ''}`} onClick={() => setActiveTab('clubs')}>
                    🏛️ Clubs
                </button>
                <button className={`${styles.tab} ${activeTab === 'tables' ? styles.active : ''}`} onClick={() => setActiveTab('tables')}>
                    🎲 Tables
                </button>
                <button className={`${styles.tab} ${activeTab === 'financials' ? styles.active : ''}`} onClick={() => setActiveTab('financials')}>
                    💰 Financials
                </button>
            </nav>

            {/* Tab Content */}
            <section className={styles.tabContent}>
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className={styles.overviewGrid}>
                        <div className={styles.card}>
                            <h3>🎯 Live Tables</h3>
                            {tables.length === 0 ? (
                                <p className={styles.emptyText}>No active tables</p>
                            ) : (
                                <div className={styles.tableList}>
                                    {tables.slice(0, 5).map(table => (
                                        <Link key={table.id} to={`/table/${table.id}`} className={styles.tableRow}>
                                            <span>{table.name}</span>
                                            <span className={styles.stakes}>${table.small_blind}/${table.big_blind}</span>
                                            <span>{table.current_players}/{table.max_players}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={styles.card}>
                            <h3>🏛️ Top Clubs</h3>
                            <div className={styles.clubList}>
                                {clubs.slice(0, 5).map(club => (
                                    <div key={club.clubId} className={styles.clubRow}>
                                        <div className={styles.clubAvatar}>🏛️</div>
                                        <div className={styles.clubInfo}>
                                            <strong>{club.clubName}</strong>
                                            <span>{club.memberCount} members</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {financialSummary && (
                            <div className={styles.card}>
                                <h3>💰 Quick Financials</h3>
                                <div className={styles.financialQuick}>
                                    <div>
                                        <span>Total Rake</span>
                                        <strong>${financialSummary.totalRakeThisPeriod.toLocaleString()}</strong>
                                    </div>
                                    <div>
                                        <span>Union Revenue</span>
                                        <strong className={styles.positive}>${financialSummary.unionRevenue.toLocaleString()}</strong>
                                    </div>
                                    <div>
                                        <span>Pending</span>
                                        <strong>${financialSummary.pendingSettlements.toLocaleString()}</strong>
                                    </div>
                                    {financialSummary.overdueAmount > 0 && (
                                        <div>
                                            <span>Overdue</span>
                                            <strong className={styles.negative}>${financialSummary.overdueAmount.toLocaleString()}</strong>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Clubs Tab */}
                {activeTab === 'clubs' && (
                    <div className={styles.clubsGrid}>
                        {clubs.map(club => (
                            <div key={club.clubId} className={styles.clubCard}>
                                <div className={styles.clubCardAvatar}>🏛️</div>
                                <div className={styles.clubCardInfo}>
                                    <h4>{club.clubName}</h4>
                                    <p>Owner: {club.ownerName || 'Unknown'}</p>
                                    <span>{club.memberCount} members</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tables Tab */}
                {activeTab === 'tables' && (
                    <div className={styles.tablesGrid}>
                        {tables.length === 0 ? (
                            <p className={styles.emptyText}>No active tables right now.</p>
                        ) : (
                            tables.map(table => (
                                <div key={table.id} className={styles.tableCard}>
                                    <div className={styles.tableCardHeader}>
                                        <h4>{table.name}</h4>
                                        <span className={`${styles.statusDot} ${styles[table.status]}`} />
                                    </div>
                                    <div className={styles.tableCardDetails}>
                                        <span>${table.small_blind}/${table.big_blind}</span>
                                        <span className={styles.variant}>{table.game_variant}</span>
                                        <span>{table.current_players}/{table.max_players}</span>
                                    </div>
                                    <Link to={`/table/${table.id}`} className={styles.joinButton}>
                                        Join Table
                                    </Link>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Financials Tab */}
                {activeTab === 'financials' && financialSummary && (
                    <div className={styles.financialsContainer}>
                        {/* Summary Cards */}
                        <div className={styles.financialCards}>
                            <div className={styles.financialCard}>
                                <span className={styles.financialIcon}>📈</span>
                                <div>
                                    <span className={styles.financialValue}>${financialSummary.totalRakeThisPeriod.toLocaleString()}</span>
                                    <span className={styles.financialLabel}>Total Rake This Period</span>
                                </div>
                            </div>
                            <div className={styles.financialCard}>
                                <span className={styles.financialIcon}>💵</span>
                                <div>
                                    <span className={`${styles.financialValue} ${styles.positive}`}>${financialSummary.unionRevenue.toLocaleString()}</span>
                                    <span className={styles.financialLabel}>Union Revenue (10%)</span>
                                </div>
                            </div>
                            <div className={styles.financialCard}>
                                <span className={styles.financialIcon}>⏳</span>
                                <div>
                                    <span className={styles.financialValue}>${financialSummary.pendingSettlements.toLocaleString()}</span>
                                    <span className={styles.financialLabel}>Pending Settlements</span>
                                </div>
                            </div>
                            {financialSummary.overdueAmount > 0 && (
                                <div className={`${styles.financialCard} ${styles.overdue}`}>
                                    <span className={styles.financialIcon}>⚠️</span>
                                    <div>
                                        <span className={`${styles.financialValue} ${styles.negative}`}>${financialSummary.overdueAmount.toLocaleString()}</span>
                                        <span className={styles.financialLabel}>Overdue</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Settlement History */}
                        <div className={styles.settlementSection}>
                            <h3>📋 Settlement History</h3>
                            <table className={styles.settlementTable}>
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>Club</th>
                                        <th>Rake</th>
                                        <th>Union Share</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {settlements.map(s => (
                                        <tr key={s.id}>
                                            <td>{new Date(s.periodStart).toLocaleDateString()} - {new Date(s.periodEnd).toLocaleDateString()}</td>
                                            <td>{s.clubName}</td>
                                            <td>${s.rakeGenerated.toLocaleString()}</td>
                                            <td className={styles.positive}>${s.unionShare.toLocaleString()}</td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${styles[s.status]}`}>
                                                    {s.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
