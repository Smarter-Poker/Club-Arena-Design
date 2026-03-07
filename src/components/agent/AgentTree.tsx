/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌳 AGENT TREE — Nested Agent Hierarchy Visualization
 * Shows club → super_agent → agent → sub_agent structure
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { AgentService, type Agent } from '../../services/AgentService';
import styles from './AgentTree.module.css';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentNode extends Agent {
    children: AgentNode[];
    isExpanded: boolean;
}

interface AgentTreeProps {
    clubId: string;
    onAgentClick?: (agent: Agent) => void;
    onTransferClick?: (agent: Agent) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function buildTree(agents: Agent[]): AgentNode[] {
    const nodeMap = new Map<string, AgentNode>();
    const roots: AgentNode[] = [];

    // Create nodes
    agents.forEach(agent => {
        nodeMap.set(agent.id, {
            ...agent,
            children: [],
            isExpanded: true
        });
    });

    // Build hierarchy
    agents.forEach(agent => {
        const node = nodeMap.get(agent.id)!;
        if (agent.parentAgentId && nodeMap.has(agent.parentAgentId)) {
            nodeMap.get(agent.parentAgentId)!.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sort by role priority
    const roleOrder = { super_agent: 0, agent: 1, sub_agent: 2 };
    const sortNodes = (nodes: AgentNode[]) => {
        nodes.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
        nodes.forEach(n => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
}

function formatCurrency(amount: number): string {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREE NODE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeNodeProps {
    node: AgentNode;
    depth: number;
    onToggle: (id: string) => void;
    onAgentClick?: (agent: Agent) => void;
    onTransferClick?: (agent: Agent) => void;
}

function TreeNode({ node, depth, onToggle, onAgentClick, onTransferClick }: TreeNodeProps) {
    const hasChildren = node.children.length > 0;
    const roleColors = {
        super_agent: '#fbbf24',
        agent: '#a78bfa',
        sub_agent: '#60a5fa'
    };
    const roleLabels = {
        super_agent: ' Super Agent',
        agent: ' Agent',
        sub_agent: ' Sub-Agent'
    };

    return (
        <div className={styles.treeNode} style={{ marginLeft: depth * 24 }}>
            <div
                className={`${styles.nodeCard} ${node.status !== 'active' ? styles.inactive : ''}`}
                onClick={() => onAgentClick?.(node)}
            >
                {/* Expand/Collapse */}
                {hasChildren && (
                    <button
                        className={styles.expandBtn}
                        onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
                    >
                        {node.isExpanded ? '▼' : '▶'}
                    </button>
                )}
                {!hasChildren && <span className={styles.expandPlaceholder} />}

                {/* Avatar */}
                <div className={styles.nodeAvatar}>
                    {node.avatarUrl ? (
                        <img src={node.avatarUrl} alt="" />
                    ) : (
                        <span>{node.displayName?.charAt(0) || '?'}</span>
                    )}
                </div>

                {/* Info */}
                <div className={styles.nodeInfo}>
                    <span className={styles.nodeName}>{node.displayName || 'Unknown'}</span>
                    <span
                        className={styles.nodeRole}
                        style={{ color: roleColors[node.role] }}
                    >
                        {roleLabels[node.role]}
                    </span>
                </div>

                {/* Stats */}
                <div className={styles.nodeStats}>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{node.activePlayerCount}</span>
                        <span className={styles.statLabel}>Players</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{node.subAgentCount}</span>
                        <span className={styles.statLabel}>Sub-Agents</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{formatCurrency(node.businessBalance)}</span>
                        <span className={styles.statLabel}>Balance</span>
                    </div>
                    <div className={styles.statItem}>
                        <span className={styles.statValue}>{node.commissionRate}%</span>
                        <span className={styles.statLabel}>Commission</span>
                    </div>
                </div>

                {/* Status Badge */}
                <span className={`${styles.statusBadge} ${styles[node.status]}`}>
                    {node.status}
                </span>

                {/* Actions */}
                {onTransferClick && node.status === 'active' && (
                    <button
                        className={styles.transferBtn}
                        onClick={(e) => { e.stopPropagation(); onTransferClick(node); }}
                    >
                        
                    </button>
                )}
            </div>

            {/* Children */}
            {node.isExpanded && hasChildren && (
                <div className={styles.nodeChildren}>
                    {node.children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            onToggle={onToggle}
                            onAgentClick={onAgentClick}
                            onTransferClick={onTransferClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function AgentTree({ clubId, onAgentClick, onTransferClick }: AgentTreeProps) {
    const [tree, setTree] = useState<AgentNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadAgents();
    }, [clubId]);

    const loadAgents = async () => {
        setLoading(true);
        setError(null);
        try {
            const agents = await AgentService.getAgents(clubId);
            setTree(buildTree(agents));
        } catch (err) {
            setError('Failed to load agent hierarchy');
            console.error(err);
        }
        setLoading(false);
    };

    const handleToggle = (id: string) => {
        setTree(prev => {
            const toggleNode = (nodes: AgentNode[]): AgentNode[] => {
                return nodes.map(node => {
                    if (node.id === id) {
                        return { ...node, isExpanded: !node.isExpanded };
                    }
                    return { ...node, children: toggleNode(node.children) };
                });
            };
            return toggleNode(prev);
        });
    };

    const expandAll = () => {
        setTree(prev => {
            const expand = (nodes: AgentNode[]): AgentNode[] => {
                return nodes.map(node => ({
                    ...node,
                    isExpanded: true,
                    children: expand(node.children)
                }));
            };
            return expand(prev);
        });
    };

    const collapseAll = () => {
        setTree(prev => {
            const collapse = (nodes: AgentNode[]): AgentNode[] => {
                return nodes.map(node => ({
                    ...node,
                    isExpanded: false,
                    children: collapse(node.children)
                }));
            };
            return collapse(prev);
        });
    };

    if (loading) {
        return <div className={styles.loading}>Loading agent hierarchy...</div>;
    }

    if (error) {
        return <div className={styles.error}>{error}</div>;
    }

    if (tree.length === 0) {
        return (
            <div className={styles.empty}>
                <span className={styles.emptyIcon}>🌳</span>
                <h4>No Agents Yet</h4>
                <p>Create your first agent to start building your hierarchy</p>
            </div>
        );
    }

    return (
        <div className={styles.agentTree}>
            {/* Controls */}
            <div className={styles.controls}>
                <button className={styles.controlBtn} onClick={expandAll}>
                     Expand All
                </button>
                <button className={styles.controlBtn} onClick={collapseAll}>
                     Collapse All
                </button>
                <button className={styles.controlBtn} onClick={loadAgents}>
                     Refresh
                </button>
            </div>

            {/* Tree */}
            <div className={styles.treeContainer}>
                {tree.map(node => (
                    <TreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        onToggle={handleToggle}
                        onAgentClick={onAgentClick}
                        onTransferClick={onTransferClick}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    <span style={{ color: '#fbbf24' }}>●</span> Super Agent
                </span>
                <span className={styles.legendItem}>
                    <span style={{ color: '#a78bfa' }}>●</span> Agent
                </span>
                <span className={styles.legendItem}>
                    <span style={{ color: '#60a5fa' }}>●</span> Sub-Agent
                </span>
            </div>
        </div>
    );
}
