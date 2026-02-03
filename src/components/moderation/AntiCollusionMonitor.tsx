/**
 * ♠ CLUB ARENA — Anti-Collusion Detection
 * Monitor for suspicious play patterns and flag potential collusion
 */

import React, { useState, useEffect } from 'react';
import './AntiCollusionMonitor.css';

interface SuspiciousPattern {
    id: string;
    type: 'soft_play' | 'chip_dumping' | 'coordinated_betting' | 'unusual_timing' | 'same_ip';
    severity: 'low' | 'medium' | 'high';
    players: string[];
    description: string;
    timestamp: string;
    confidence: number;
    handsAnalyzed: number;
}

interface CollusionReport {
    tableId: string;
    tableName: string;
    analysisDate: string;
    handsAnalyzed: number;
    suspiciousPatterns: SuspiciousPattern[];
    riskScore: number;
}

interface AntiCollusionMonitorProps {
    tableId?: string;
    clubId?: string;
    onInvestigate?: (pattern: SuspiciousPattern) => void;
    onDismiss?: (patternId: string) => void;
}

export const AntiCollusionMonitor: React.FC<AntiCollusionMonitorProps> = ({
    tableId,
    clubId,
    onInvestigate,
    onDismiss,
}) => {
    const [reports, setReports] = useState<CollusionReport[]>([]);
    const [selectedReport, setSelectedReport] = useState<CollusionReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

    useEffect(() => {
        loadReports();
    }, [tableId, clubId]);

    const loadReports = async () => {
        // Mock data for demo
        const mockReports: CollusionReport[] = [
            {
                tableId: 'table-1',
                tableName: 'High Stakes NLH',
                analysisDate: new Date().toISOString(),
                handsAnalyzed: 1250,
                riskScore: 72,
                suspiciousPatterns: [
                    {
                        id: '1',
                        type: 'soft_play',
                        severity: 'high',
                        players: ['PlayerA', 'PlayerB'],
                        description: 'Players rarely bet against each other despite 47 shared pots',
                        timestamp: new Date().toISOString(),
                        confidence: 89,
                        handsAnalyzed: 47,
                    },
                    {
                        id: '2',
                        type: 'chip_dumping',
                        severity: 'medium',
                        players: ['PlayerC', 'PlayerD'],
                        description: 'Unusual all-in patterns with weak hands when heads-up',
                        timestamp: new Date().toISOString(),
                        confidence: 67,
                        handsAnalyzed: 12,
                    },
                ],
            },
            {
                tableId: 'table-2',
                tableName: 'PLO Action',
                analysisDate: new Date().toISOString(),
                handsAnalyzed: 890,
                riskScore: 35,
                suspiciousPatterns: [
                    {
                        id: '3',
                        type: 'same_ip',
                        severity: 'medium',
                        players: ['UserX', 'UserY'],
                        description: 'Multiple accounts detected from same IP address',
                        timestamp: new Date().toISOString(),
                        confidence: 95,
                        handsAnalyzed: 890,
                    },
                ],
            },
        ];
        setReports(mockReports);
        setLoading(false);
    };

    const getPatternIcon = (type: SuspiciousPattern['type']): string => {
        switch (type) {
            case 'soft_play': return '🤝';
            case 'chip_dumping': return '💰';
            case 'coordinated_betting': return '📊';
            case 'unusual_timing': return '⏱️';
            case 'same_ip': return '🌐';
            default: return '⚠️';
        }
    };

    const getSeverityClass = (severity: SuspiciousPattern['severity']): string => {
        return `severity-${severity}`;
    };

    const getRiskColor = (score: number): string => {
        if (score >= 70) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    };

    const filteredPatterns = (patterns: SuspiciousPattern[]) => {
        if (filter === 'all') return patterns;
        return patterns.filter(p => p.severity === filter);
    };

    if (loading) {
        return (
            <div className="collusion-monitor loading">
                <div className="spinner" />
                <p>Analyzing patterns...</p>
            </div>
        );
    }

    return (
        <div className="collusion-monitor">
            <div className="monitor-header">
                <h2>🛡️ Anti-Collusion Monitor</h2>
                <div className="filter-buttons">
                    {(['all', 'high', 'medium', 'low'] as const).map(f => (
                        <button
                            key={f}
                            className={`filter-btn ${filter === f ? 'active' : ''}`}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Report Cards */}
            <div className="report-cards">
                {reports.map(report => (
                    <div
                        key={report.tableId}
                        className={`report-card ${selectedReport?.tableId === report.tableId ? 'selected' : ''}`}
                        onClick={() => setSelectedReport(report)}
                    >
                        <div className="report-header">
                            <span className="table-name">{report.tableName}</span>
                            <div className={`risk-score ${getRiskColor(report.riskScore)}`}>
                                <span>{report.riskScore}</span>
                                <span className="score-label">Risk</span>
                            </div>
                        </div>
                        <div className="report-stats">
                            <span>{report.handsAnalyzed} hands</span>
                            <span>{report.suspiciousPatterns.length} flags</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pattern Details */}
            {selectedReport && (
                <div className="pattern-details">
                    <h3>Suspicious Patterns - {selectedReport.tableName}</h3>
                    <div className="patterns-list">
                        {filteredPatterns(selectedReport.suspiciousPatterns).map(pattern => (
                            <div
                                key={pattern.id}
                                className={`pattern-card ${getSeverityClass(pattern.severity)}`}
                            >
                                <div className="pattern-header">
                                    <span className="pattern-icon">{getPatternIcon(pattern.type)}</span>
                                    <span className="pattern-type">{pattern.type.replace('_', ' ')}</span>
                                    <span className={`severity-badge ${pattern.severity}`}>
                                        {pattern.severity.toUpperCase()}
                                    </span>
                                </div>
                                <p className="pattern-description">{pattern.description}</p>
                                <div className="pattern-players">
                                    <span className="label">Players:</span>
                                    {pattern.players.map(p => (
                                        <span key={p} className="player-tag">{p}</span>
                                    ))}
                                </div>
                                <div className="pattern-meta">
                                    <span>Confidence: {pattern.confidence}%</span>
                                    <span>{pattern.handsAnalyzed} hands analyzed</span>
                                </div>
                                <div className="pattern-actions">
                                    <button
                                        className="btn-investigate"
                                        onClick={() => onInvestigate?.(pattern)}
                                    >
                                        🔍 Investigate
                                    </button>
                                    <button
                                        className="btn-dismiss"
                                        onClick={() => onDismiss?.(pattern.id)}
                                    >
                                        ✕ Dismiss
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!selectedReport && (
                <div className="empty-state">
                    <span className="empty-icon">📊</span>
                    <p>Select a table to view detailed analysis</p>
                </div>
            )}
        </div>
    );
};

export default AntiCollusionMonitor;
