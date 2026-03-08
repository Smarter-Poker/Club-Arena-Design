import React, { useState, useMemo } from 'react';
import { tournamentService, BLIND_STRUCTURES, PAYOUT_STRUCTURES } from '../../services/TournamentService';
import styles from './CreateTournamentModal.module.css';
import { useToast } from '../common/Toast';

interface Props {
    clubId: string;
    unionId?: string;  // If provided, this is a XMTT (union-level tournament)
    onClose: () => void;
    onSuccess: () => void;
}

type TournamentFormat = 'mtt' | 'sng' | 'bounty' | 'progressive_bounty' | 'mystery_bounty' | 'spin';

export default function CreateTournamentModal({ clubId, unionId, onClose, onSuccess }: Props) {
    const toast = useToast();

    // ── Core Config ──
    const [name, setName] = useState('');
    const [format, setFormat] = useState<TournamentFormat>('mtt');
    const [buyIn, setBuyIn] = useState('10');
    const [rake, setRake] = useState('1');
    const [startingChips, setStartingChips] = useState('1500');
    const [maxPlayers, setMaxPlayers] = useState('50');
    const [blindSpeed, setBlindSpeed] = useState<'turbo' | 'regular' | 'deepStack'>('turbo');
    const [guaranteedPrize, setGuaranteedPrize] = useState('0');

    // ── Start Time ──
    const [startTimeMode, setStartTimeMode] = useState<'now' | 'scheduled'>('now');
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');

    // ── Late Registration ──
    const [lateRegMins, setLateRegMins] = useState('15');

    // ── Rebuy / Add-On ──
    const [isRebuy, setIsRebuy] = useState(false);
    const [rebuyCost, setRebuyCost] = useState('');
    const [rebuyChips, setRebuyChips] = useState('');
    const [rebuyLevels, setRebuyLevels] = useState('4');
    const [addOnAvailable, setAddOnAvailable] = useState(false);
    const [addOnCost, setAddOnCost] = useState('');
    const [addOnChips, setAddOnChips] = useState('');

    // ── Bounty Config ──
    const [bountyAmount, setBountyAmount] = useState('5');

    // ── Mystery Bounty Config ──
    const [mysteryBountyMin, setMysteryBountyMin] = useState('1');
    const [mysteryBountyMax, setMysteryBountyMax] = useState('100');

    // ── Multi-Day Config ──
    const [isMultiDay, setIsMultiDay] = useState(false);
    const [totalDays, setTotalDays] = useState('2');

    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Auto-select payout structure ──
    // SNG/Spin: based on max players. MTT/Bounty/PKO/Mystery: default MTT structure (no max player cap)
    const payoutStructure = useMemo(() => {
        if (format === 'spin') return [{ place: 1, percentage: 100 }];
        const mp = parseInt(maxPlayers) || 0;
        if (format === 'sng') {
            if (mp <= 6) return PAYOUT_STRUCTURES.sng6;
            return PAYOUT_STRUCTURES.sng9;
        }
        // MTT / Bounty / PKO / Mystery — no max player limit, use standard MTT payouts
        return PAYOUT_STRUCTURES.mtt50;
    }, [maxPlayers, format]);

    const isSngOrSpin = format === 'sng' || format === 'spin';

    // ── Auto-set defaults when format changes ──
    const handleFormatChange = (f: TournamentFormat) => {
        setFormat(f);
        switch (f) {
            case 'sng':
                setMaxPlayers('6');
                setLateRegMins('0');
                setStartTimeMode('now');
                setIsMultiDay(false);
                break;
            case 'spin':
                setMaxPlayers('3');
                setLateRegMins('0');
                setStartTimeMode('now');
                setIsMultiDay(false);
                setIsRebuy(false);
                setAddOnAvailable(false);
                break;
            case 'bounty':
            case 'progressive_bounty':
            case 'mystery_bounty':
                setMaxPlayers('0'); // Unlimited — max players only for SNG/Spin
                setLateRegMins('30');
                break;
            default:
                setMaxPlayers('0'); // Unlimited — max players only for SNG/Spin
                setLateRegMins('15');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // ── Bounty validation (defense-in-depth) ──
            if (isBountyFormat) {
                const ba = parseFloat(bountyAmount);
                if (!ba || ba <= 0) {
                    toast.error('Bounty amount is required for bounty tournaments');
                    setIsSubmitting(false);
                    return;
                }
                if (format === 'mystery_bounty') {
                    const min = parseFloat(mysteryBountyMin);
                    const max = parseFloat(mysteryBountyMax);
                    if (!min || min <= 0 || !max || max <= 0) {
                        toast.error('Mystery bounty min and max multipliers are required');
                        setIsSubmitting(false);
                        return;
                    }
                    if (max <= min) {
                        toast.error('Mystery bounty max multiplier must be greater than min');
                        setIsSubmitting(false);
                        return;
                    }
                }
            }

            const parsedBuyIn = parseFloat(buyIn);
            const parsedRake = parseFloat(rake);

            // Build start time
            let startTime: Date | undefined;
            if (startTimeMode === 'scheduled' && scheduledDate && scheduledTime) {
                startTime = new Date(`${scheduledDate}T${scheduledTime}`);
            } else {
                // Start 1 minute from now to allow last-second registrations
                startTime = new Date(Date.now() + 60 * 1000);
            }

            await tournamentService.createTournament(clubId, {
                name,
                type: format,
                buyIn: parsedBuyIn,
                rake: parsedRake,
                startingStack: parseInt(startingChips),
                maxPlayers: isSngOrSpin ? parseInt(maxPlayers) : 0, // 0 = unlimited for MTT/Bounty/PKO/Mystery
                minPlayers: 3,
                blindStructure: BLIND_STRUCTURES[blindSpeed],
                payoutStructure,
                lateRegistrationLevels: parseInt(lateRegMins) || 0,
                startTime,
                isRebuy,
                rebuyLevels: isRebuy ? parseInt(rebuyLevels) || 4 : undefined,
                rebuyChips: isRebuy ? (parseInt(rebuyChips) || parseInt(startingChips)) : undefined,
                rebuyCost: isRebuy ? (parseFloat(rebuyCost) || parsedBuyIn) : undefined,
                addOnAvailable,
                addOnChips: addOnAvailable ? (parseInt(addOnChips) || parseInt(startingChips)) : undefined,
                addOnCost: addOnAvailable ? (parseFloat(addOnCost) || parsedBuyIn) : undefined,
                guaranteedPrize: parseFloat(guaranteedPrize) || 0,
                isMultiDay,
                totalDays: isMultiDay ? parseInt(totalDays) || 2 : undefined,
                isXmtt: !!unionId,
                unionId: unionId || undefined,
                bountyConfig: (format === 'bounty' || format === 'progressive_bounty' || format === 'mystery_bounty') ? {
                    bountyType: format === 'bounty' ? 'fixed' : format === 'progressive_bounty' ? 'progressive' : 'mystery',
                    baseBounty: parseFloat(bountyAmount) || 5,
                    ...(format === 'mystery_bounty' ? (() => {
                        const minMult = parseFloat(mysteryBountyMin) || 1;
                        const maxMult = parseFloat(mysteryBountyMax) || 100;
                        // Generate tiers from min to max with probability distribution
                        // Bottom tier (most common), middle tiers, top tier (rarest)
                        const tiers: Array<{ minMultiplier: number; maxMultiplier: number; probability: number }> = [];
                        tiers.push({ minMultiplier: minMult, maxMultiplier: minMult, probability: 60 });
                        if (maxMult >= minMult * 2) {
                            tiers.push({ minMultiplier: minMult * 2, maxMultiplier: minMult * 2, probability: 25 });
                        }
                        if (maxMult >= minMult * 5) {
                            tiers.push({ minMultiplier: minMult * 5, maxMultiplier: minMult * 5, probability: 10 });
                        }
                        if (maxMult >= minMult * 10) {
                            tiers.push({ minMultiplier: minMult * 10, maxMultiplier: minMult * 10, probability: 4 });
                        }
                        if (maxMult >= minMult * 50) {
                            tiers.push({ minMultiplier: Math.min(minMult * 50, maxMult), maxMultiplier: Math.min(minMult * 50, maxMult), probability: 0.9 });
                        }
                        tiers.push({ minMultiplier: maxMult, maxMultiplier: maxMult, probability: 0.1 });
                        return { mysteryTiers: tiers };
                    })() : {}),
                } : undefined,
            });
            toast.success('Tournament created');
            onSuccess();
        } catch (error: any) {
            console.error('Failed to create tournament:', error);
            toast.error(error?.message || 'Failed to create tournament');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isBountyFormat = format === 'bounty' || format === 'progressive_bounty' || format === 'mystery_bounty';

    // ── Validation: ALL fields required before tournament can be created ──
    const bountyValid = (() => {
        if (!isBountyFormat) return true;
        const ba = parseFloat(bountyAmount);
        if (!ba || ba <= 0) return false;
        if (format === 'mystery_bounty') {
            const min = parseFloat(mysteryBountyMin);
            const max = parseFloat(mysteryBountyMax);
            if (!min || min <= 0 || !max || max <= 0 || max <= min) return false;
        }
        return true;
    })();

    const coreValid = (() => {
        if (!name.trim()) return false;
        if (parseFloat(buyIn) <= 0) return false;
        if (parseInt(startingChips) <= 0) return false;
        // Max players only required for SNG and Spin (they need a fixed table size)
        if (isSngOrSpin && parseInt(maxPlayers) < 2) return false;
        // Scheduled tournament must have date+time
        if (startTimeMode === 'scheduled' && (!scheduledDate || !scheduledTime)) return false;
        // Rebuy fields required if rebuy enabled
        if (isRebuy) {
            if (parseInt(rebuyLevels) <= 0) return false;
        }
        return true;
    })();

    const canSubmit = coreValid && bountyValid && !isSubmitting;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2>{unionId ? 'Create Union Tournament (XMTT)' : 'Create Tournament'}</h2>
                    <button className={styles.closeParams} onClick={onClose}>&times;</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label>Tournament Name <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                            className={styles.input}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Saturday Night Turbo"
                            required
                            style={!name.trim() ? { borderColor: '#ef4444' } : undefined}
                        />
                    </div>

                    {/* Format Selection */}
                    <div className={styles.formGroup}>
                        <label>Format <span style={{ color: '#ef4444' }}>*</span></label>
                        <select
                            className={styles.select}
                            value={format}
                            onChange={e => handleFormatChange(e.target.value as TournamentFormat)}
                        >
                            <option value="mtt">Multi-Table (MTT)</option>
                            <option value="sng">Sit & Go (SNG)</option>
                            <option value="bounty">Bounty (KO)</option>
                            <option value="progressive_bounty">Progressive KO (PKO)</option>
                            <option value="mystery_bounty">Mystery Bounty</option>
                            <option value="spin">Spin & Go</option>
                        </select>
                    </div>

                    <div className={styles.row}>
                        {/* Max Players — ONLY for SNG and Spin (they need a fixed table size to start) */}
                        {format === 'spin' && (
                            <div className={styles.col}>
                                <div className={styles.formGroup}>
                                    <label>Players</label>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value="3 Players (Fixed)"
                                        disabled
                                        style={{ opacity: 0.7 }}
                                    />
                                    <span className={styles.helperText}>Spins always start with 3 players</span>
                                </div>
                            </div>
                        )}
                        {format === 'sng' && (
                            <div className={styles.col}>
                                <div className={styles.formGroup}>
                                    <label>Max Players <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select
                                        className={styles.select}
                                        value={maxPlayers}
                                        onChange={e => setMaxPlayers(e.target.value)}
                                    >
                                        <option value="2">Heads Up (2)</option>
                                        <option value="3">3 Players</option>
                                        <option value="6">6-Max</option>
                                        <option value="9">Full Ring (9)</option>
                                    </select>
                                </div>
                            </div>
                        )}
                        <div className={styles.col}>
                            <div className={styles.formGroup}>
                                <label>Speed <span style={{ color: '#ef4444' }}>*</span></label>
                                <select
                                    className={styles.select}
                                    value={blindSpeed}
                                    onChange={e => setBlindSpeed(e.target.value as any)}
                                >
                                    <option value="turbo">Turbo (3m)</option>
                                    <option value="regular">Regular (8m)</option>
                                    <option value="deepStack">Deep Stack (15m)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className={styles.row}>
                        <div className={styles.col}>
                            <div className={styles.formGroup}>
                                <label>Buy-in <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={buyIn}
                                    onChange={e => setBuyIn(e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        </div>
                        <div className={styles.col}>
                            <div className={styles.formGroup}>
                                <label>Fee</label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={rake}
                                    onChange={e => setRake(e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                        </div>
                    </div>

                    <div className={styles.row}>
                        <div className={styles.col}>
                            <div className={styles.formGroup}>
                                <label>Starting Chips <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={startingChips}
                                    onChange={e => setStartingChips(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className={styles.col}>
                            <div className={styles.formGroup}>
                                <label>Guaranteed Prize</label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={guaranteedPrize}
                                    onChange={e => setGuaranteedPrize(e.target.value)}
                                    min="0"
                                    step="0.01"
                                />
                                <span className={styles.helperText}>0 = no guarantee</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Start Time ── */}
                    {format !== 'sng' && format !== 'spin' && (
                        <div className={styles.formGroup}>
                            <label>Start Time</label>
                            <div className={styles.row}>
                                <div className={styles.col}>
                                    <select
                                        className={styles.select}
                                        value={startTimeMode}
                                        onChange={e => setStartTimeMode(e.target.value as any)}
                                    >
                                        <option value="now">Start in 1 min</option>
                                        <option value="scheduled">Schedule</option>
                                    </select>
                                </div>
                                {startTimeMode === 'scheduled' && (
                                    <>
                                        <div className={styles.col}>
                                            <input
                                                type="date"
                                                className={styles.input}
                                                value={scheduledDate}
                                                onChange={e => setScheduledDate(e.target.value)}
                                            />
                                        </div>
                                        <div className={styles.col}>
                                            <input
                                                type="time"
                                                className={styles.input}
                                                value={scheduledTime}
                                                onChange={e => setScheduledTime(e.target.value)}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Late Registration ── */}
                    {format !== 'spin' && (
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <div className={styles.formGroup}>
                                    <label>Late Reg (mins)</label>
                                    <input
                                        type="number"
                                        className={styles.input}
                                        value={lateRegMins}
                                        onChange={e => setLateRegMins(e.target.value)}
                                        min="0"
                                        max="120"
                                    />
                                    <span className={styles.helperText}>0 = no late registration</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Bounty Config ── */}
                    {isBountyFormat && (
                        <div className={styles.sectionDivider}>
                            <span className={styles.sectionLabel}>
                                {format === 'bounty' ? 'Bounty' : format === 'progressive_bounty' ? 'PKO' : 'Mystery Bounty'} Settings
                                <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>
                            </span>
                            <div className={styles.row}>
                                <div className={styles.col}>
                                    <div className={styles.formGroup}>
                                        <label>{format === 'mystery_bounty' ? 'Base Bounty (chips)' : 'Bounty Per KO (chips)'} <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input
                                            type="number"
                                            className={styles.input}
                                            value={bountyAmount}
                                            onChange={e => setBountyAmount(e.target.value)}
                                            min="0.01"
                                            step="0.01"
                                            required
                                            style={(!bountyAmount || parseFloat(bountyAmount) <= 0) ? { borderColor: '#ef4444' } : undefined}
                                        />
                                        <span className={styles.helperText}>Amount awarded for each knockout</span>
                                    </div>
                                </div>
                                {format === 'mystery_bounty' && (
                                    <>
                                        <div className={styles.col}>
                                            <div className={styles.formGroup}>
                                                <label>Min Multiplier <span style={{ color: '#ef4444' }}>*</span></label>
                                                <input
                                                    type="number"
                                                    className={styles.input}
                                                    value={mysteryBountyMin}
                                                    onChange={e => setMysteryBountyMin(e.target.value)}
                                                    min="1"
                                                    step="1"
                                                    required
                                                    style={(!mysteryBountyMin || parseFloat(mysteryBountyMin) <= 0) ? { borderColor: '#ef4444' } : undefined}
                                                />
                                                <span className={styles.helperText}>Lowest multiplier (e.g. 1x)</span>
                                            </div>
                                        </div>
                                        <div className={styles.col}>
                                            <div className={styles.formGroup}>
                                                <label>Max Multiplier <span style={{ color: '#ef4444' }}>*</span></label>
                                                <input
                                                    type="number"
                                                    className={styles.input}
                                                    value={mysteryBountyMax}
                                                    onChange={e => setMysteryBountyMax(e.target.value)}
                                                    min="2"
                                                    step="1"
                                                    required
                                                    style={(parseFloat(mysteryBountyMax) <= parseFloat(mysteryBountyMin)) ? { borderColor: '#ef4444' } : undefined}
                                                />
                                                <span className={styles.helperText}>Highest multiplier (e.g. 100x)</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            {format === 'bounty' && (
                                <span className={styles.helperText}>
                                    Full bounty amount is awarded to the knocker on each elimination
                                </span>
                            )}
                            {format === 'progressive_bounty' && (
                                <span className={styles.helperText}>
                                    50% of bounty goes to knocker, 50% added to knocker's own bounty
                                </span>
                            )}
                            {format === 'mystery_bounty' && (
                                <span className={styles.helperText}>
                                    Mystery bounty is randomly assigned at registration between {mysteryBountyMin}x and {mysteryBountyMax}x the base bounty, revealed on knockout
                                </span>
                            )}
                            {!bountyValid && (
                                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 6 }}>
                                    {(!bountyAmount || parseFloat(bountyAmount) <= 0)
                                        ? 'Bounty amount is required and must be greater than 0'
                                        : 'Mystery max multiplier must be greater than min multiplier'}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ── Rebuy / Add-On ── */}
                    {format !== 'spin' && (
                        <div className={styles.sectionDivider}>
                            <span className={styles.sectionLabel}>Rebuy / Add-On</span>
                            <div className={styles.row}>
                                <div className={styles.col}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.toggleLabel}>
                                            <input
                                                type="checkbox"
                                                checked={isRebuy}
                                                onChange={e => setIsRebuy(e.target.checked)}
                                                className={styles.checkbox}
                                            />
                                            Allow Rebuys
                                        </label>
                                    </div>
                                </div>
                                <div className={styles.col}>
                                    <div className={styles.formGroup}>
                                        <label className={styles.toggleLabel}>
                                            <input
                                                type="checkbox"
                                                checked={addOnAvailable}
                                                onChange={e => setAddOnAvailable(e.target.checked)}
                                                className={styles.checkbox}
                                            />
                                            Allow Add-Ons
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {isRebuy && (
                                <div className={styles.row}>
                                    <div className={styles.col}>
                                        <div className={styles.formGroup}>
                                            <label>Rebuy Cost</label>
                                            <input
                                                type="number"
                                                className={styles.input}
                                                value={rebuyCost}
                                                onChange={e => setRebuyCost(e.target.value)}
                                                placeholder={buyIn}
                                                min="0"
                                                step="0.01"
                                            />
                                            <span className={styles.helperText}>Blank = same as buy-in</span>
                                        </div>
                                    </div>
                                    <div className={styles.col}>
                                        <div className={styles.formGroup}>
                                            <label>Rebuy Chips</label>
                                            <input
                                                type="number"
                                                className={styles.input}
                                                value={rebuyChips}
                                                onChange={e => setRebuyChips(e.target.value)}
                                                placeholder={startingChips}
                                            />
                                            <span className={styles.helperText}>Blank = starting stack</span>
                                        </div>
                                    </div>
                                    <div className={styles.col}>
                                        <div className={styles.formGroup}>
                                            <label>Rebuy Levels</label>
                                            <input
                                                type="number"
                                                className={styles.input}
                                                value={rebuyLevels}
                                                onChange={e => setRebuyLevels(e.target.value)}
                                                min="1"
                                                max="20"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {addOnAvailable && (
                                <div className={styles.row}>
                                    <div className={styles.col}>
                                        <div className={styles.formGroup}>
                                            <label>Add-On Cost</label>
                                            <input
                                                type="number"
                                                className={styles.input}
                                                value={addOnCost}
                                                onChange={e => setAddOnCost(e.target.value)}
                                                placeholder={buyIn}
                                                min="0"
                                                step="0.01"
                                            />
                                            <span className={styles.helperText}>Blank = same as buy-in</span>
                                        </div>
                                    </div>
                                    <div className={styles.col}>
                                        <div className={styles.formGroup}>
                                            <label>Add-On Chips</label>
                                            <input
                                                type="number"
                                                className={styles.input}
                                                value={addOnChips}
                                                onChange={e => setAddOnChips(e.target.value)}
                                                placeholder={startingChips}
                                            />
                                            <span className={styles.helperText}>Blank = starting stack</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Multi-Day Toggle ── */}
                    {format === 'mtt' && (
                        <div className={styles.row}>
                            <div className={styles.col}>
                                <div className={styles.formGroup}>
                                    <label className={styles.toggleLabel}>
                                        <input
                                            type="checkbox"
                                            checked={isMultiDay}
                                            onChange={e => setIsMultiDay(e.target.checked)}
                                            className={styles.checkbox}
                                        />
                                        Multi-Day Tournament
                                    </label>
                                </div>
                            </div>
                            {isMultiDay && (
                                <div className={styles.col}>
                                    <div className={styles.formGroup}>
                                        <label>Total Days</label>
                                        <input
                                            type="number"
                                            className={styles.input}
                                            value={totalDays}
                                            onChange={e => setTotalDays(e.target.value)}
                                            min="2"
                                            max="7"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Payout Info ── */}
                    <div className={styles.payoutPreview}>
                        <span className={styles.sectionLabel}>Payout Structure ({payoutStructure.length} places paid)</span>
                        <div className={styles.payoutList}>
                            {payoutStructure.map((p, i) => (
                                <span key={i} className={styles.payoutItem}>
                                    {p.place}{p.place === 1 ? 'st' : p.place === 2 ? 'nd' : p.place === 3 ? 'rd' : 'th'}: {p.percentage}%
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* ── Validation Summary ── */}
                    {!canSubmit && !isSubmitting && (
                        <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '4px 0' }}>
                            {!name.trim() && <p>Tournament name is required</p>}
                            {parseFloat(buyIn) <= 0 && <p>Buy-in must be greater than 0</p>}
                            {parseInt(startingChips) <= 0 && <p>Starting chips must be greater than 0</p>}
                            {startTimeMode === 'scheduled' && (!scheduledDate || !scheduledTime) && <p>Scheduled date and time are required</p>}
                            {isRebuy && parseInt(rebuyLevels) <= 0 && <p>Rebuy levels must be set when rebuys are enabled</p>}
                            {!bountyValid && isBountyFormat && <p>Bounty configuration is incomplete</p>}
                        </div>
                    )}

                    <div className={styles.actions}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={styles.createBtn}
                            disabled={!canSubmit}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Tournament'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
