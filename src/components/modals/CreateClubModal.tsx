/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CreateClubModal — High-Fidelity Club Creation Popup
 * ═══════════════════════════════════════════════════════════════════════════════
 * Uses the sci-fi themed modal frame with:
 * - Club name input
 * - Logo upload or AI generation buttons
 * - Terms acceptance checkbox
 * - CREATE button
 */

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../stores/useUserStore';
import { useToast } from '../common/Toast';
import { ClubCardGenerator } from '../../services/ClubCardGenerator';
import styles from './CreateClubModal.module.css';

interface CreateClubModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (clubId: string) => void;
}

// High-fidelity modal frame
const MODAL_FRAME_URL = `${import.meta.env.BASE_URL}images/modals/create-club-modal-frame.png`;

// Club level calculation based on member count
function calculateClubLevel(memberCount: number): number {
    const levelThresholds = [
        25, 50, 75, 100, 150, 200, 275, 350, 425, 500,           // Levels 1-10
        600, 750, 900, 1100, 1300, 1550, 1850, 2200, 2600, 3000, // Levels 11-20
        3500, 4000, 4600, 5300, 6000, 7000, 8250, 9750, 11500, 13500, // Levels 21-30
        16000, 19000, 22500, 26500, 31000, 36500, 43000, 50500, 59000, 68500, // Levels 31-40
        79000, 91000, 105000, 121000, 140000, 165000, 195000, 235000, 285000 // Levels 41-49
    ];

    for (let i = 0; i < levelThresholds.length; i++) {
        if (memberCount <= levelThresholds[i]) return i + 1;
    }
    return 50; // Max level
}

export default function CreateClubModal({ isOpen, onClose, onSuccess }: CreateClubModalProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [clubName, setClubName] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [hasAgreed, setHasAgreed] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showLogoGenerator, setShowLogoGenerator] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be less than 5MB');
            return;
        }

        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            setLogoPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleLogoGenerated = (logoDataUrl: string) => {
        setLogoPreview(logoDataUrl);
        setShowLogoGenerator(false);
    };

    const handleCreate = async () => {
        if (!clubName.trim()) {
            toast.error('Please enter a club name');
            return;
        }

        if (clubName.trim().length < 3) {
            toast.error('Club name must be at least 3 characters');
            return;
        }

        if (!logoPreview) {
            toast.error('Please upload or create a logo');
            return;
        }

        if (!hasAgreed) {
            toast.error('Please accept the terms to continue');
            return;
        }

        setIsCreating(true);

        try {
            const clubIdNumber = Math.floor(10000 + Math.random() * 90000);

            // Generate club card image
            const cardDataUrl = await ClubCardGenerator.generateCard({
                logoUrl: logoPreview,
                clubId: clubIdNumber,
                clubName: clubName.trim().toUpperCase(),
            });

            // Upload card to storage
            const cardBlob = await fetch(cardDataUrl).then(r => r.blob());
            const cardFileName = `club-cards/${clubIdNumber}-card.png`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('club-assets')
                .upload(cardFileName, cardBlob, {
                    contentType: 'image/png',
                    upsert: true,
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
            }

            let cardUrl = null;
            if (uploadData) {
                const { data: urlData } = supabase.storage
                    .from('club-assets')
                    .getPublicUrl(cardFileName);
                cardUrl = urlData.publicUrl;
            }

            // Create club - new clubs start with 1 member = Level 1
            const { data: clubData, error: insertError } = await supabase
                .from('clubs')
                .insert({
                    club_id: clubIdNumber,
                    name: clubName.trim(),
                    owner_id: user?.id,
                    is_public: true,
                    requires_approval: true,
                    card_image_url: cardUrl,
                    logo_url: cardUrl,
                    member_count: 1,
                    level: calculateClubLevel(1), // Level 1 for new clubs
                    active_players: 1,
                    settings: {
                        default_rake_percent: 5,
                        rake_cap: 3,
                        min_buy_in_bb: 40,
                        max_buy_in_bb: 200,
                        time_bank_seconds: 30,
                        allow_straddle: true,
                        allow_run_it_twice: true,
                    },
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // Add owner as first member
            await supabase
                .from('club_members')
                .insert({
                    club_id: clubData.id,
                    user_id: user?.id,
                    role: 'owner',
                    status: 'active',
                });

            toast.success(`Club "${clubName}" created successfully!`);

            setClubName('');
            setLogoFile(null);
            setLogoPreview(null);
            setHasAgreed(false);

            onClose();
            onSuccess?.(clubData.id);
            window.location.reload();

        } catch (err: any) {
            console.error('Failed to create club:', err);
            toast.error(err.message || 'Failed to create club');
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
                {/* High-fidelity frame background */}
                <img
                    src={MODAL_FRAME_URL}
                    alt=""
                    className={styles.frameImage}
                    draggable={false}
                />

                {/* Close button - positioned over the X in frame */}
                <button className={styles.closeButton} onClick={onClose} aria-label="Close" />

                {/* Club Name Input - positioned over the input field in frame */}
                <input
                    type="text"
                    className={styles.clubNameInput}
                    placeholder=""
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    maxLength={30}
                    autoComplete="off"
                />

                {/* Upload Logo button zone */}
                <button
                    className={styles.uploadLogoBtn}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Upload Logo"
                >
                    {logoPreview && (
                        <img src={logoPreview} alt="Logo preview" className={styles.logoThumb} />
                    )}
                </button>

                {/* Create Logo button zone */}
                <button
                    className={styles.createLogoBtn}
                    onClick={() => setShowLogoGenerator(true)}
                    aria-label="Create Logo"
                />

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={handleFileSelect}
                />

                {/* Terms checkbox - positioned over the checkbox area */}
                <label className={styles.termsLabel}>
                    <input
                        type="checkbox"
                        checked={hasAgreed}
                        onChange={(e) => setHasAgreed(e.target.checked)}
                        className={styles.termsCheckbox}
                    />
                </label>

                {/* CREATE button zone */}
                <button
                    className={styles.createButton}
                    onClick={handleCreate}
                    disabled={isCreating || !hasAgreed || !clubName.trim() || !logoPreview}
                    aria-label="Create Club"
                >
                    {isCreating && <span className={styles.spinner}>⟳</span>}
                </button>

                {/* Logo Generator Modal */}
                {showLogoGenerator && (
                    <LogoGeneratorModal
                        onSelect={handleLogoGenerated}
                        onClose={() => setShowLogoGenerator(false)}
                    />
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Logo Generator Modal (Preset Templates)
// ═══════════════════════════════════════════════════════════════════════════════

interface LogoGeneratorModalProps {
    onSelect: (logoDataUrl: string) => void;
    onClose: () => void;
}

const LOGO_TEMPLATES = [
    { id: 'eagle', icon: '🦅', name: 'Eagle', color: '#ffd700' },
    { id: 'dragon', icon: '🐉', name: 'Dragon', color: '#ff4444' },
    { id: 'shark', icon: '🦈', name: 'Shark', color: '#00bfff' },
    { id: 'lion', icon: '🦁', name: 'Lion', color: '#ff8c00' },
    { id: 'phoenix', icon: '🔥', name: 'Phoenix', color: '#ff6b35' },
    { id: 'diamond', icon: '💎', name: 'Diamond', color: '#00ffff' },
    { id: 'crown', icon: '👑', name: 'Crown', color: '#ffd700' },
    { id: 'ace', icon: '🂡', name: 'Ace', color: '#ffffff' },
    { id: 'wolf', icon: '🐺', name: 'Wolf', color: '#808080' },
    { id: 'tiger', icon: '🐯', name: 'Tiger', color: '#ff9900' },
    { id: 'snake', icon: '🐍', name: 'Snake', color: '#00ff00' },
    { id: 'skull', icon: '💀', name: 'Skull', color: '#cccccc' },
];

function LogoGeneratorModal({ onSelect, onClose }: LogoGeneratorModalProps) {
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!selectedTemplate) return;

        setIsGenerating(true);

        try {
            const template = LOGO_TEMPLATES.find(t => t.id === selectedTemplate);
            if (!template) return;

            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 400;
            const ctx = canvas.getContext('2d')!;

            // Background gradient
            const gradient = ctx.createRadialGradient(200, 200, 0, 200, 200, 200);
            gradient.addColorStop(0, template.color);
            gradient.addColorStop(1, '#0a1929');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 400, 400);

            // Draw icon
            ctx.font = '180px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(template.icon, 200, 200);

            const logoDataUrl = canvas.toDataURL('image/png');
            onSelect(logoDataUrl);
        } catch (err) {
            console.error('Failed to generate logo:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className={styles.logoGeneratorOverlay} onClick={onClose}>
            <div className={styles.logoGeneratorModal} onClick={(e) => e.stopPropagation()}>
                <h3>Choose a Logo Template</h3>
                <div className={styles.templateGrid}>
                    {LOGO_TEMPLATES.map(template => (
                        <button
                            key={template.id}
                            className={`${styles.templateBtn} ${selectedTemplate === template.id ? styles.selected : ''}`}
                            onClick={() => setSelectedTemplate(template.id)}
                            style={{ borderColor: template.color }}
                        >
                            <span className={styles.templateIcon}>{template.icon}</span>
                            <span className={styles.templateName}>{template.name}</span>
                        </button>
                    ))}
                </div>
                <div className={styles.logoGeneratorActions}>
                    <button
                        className={styles.generateBtn}
                        onClick={handleGenerate}
                        disabled={!selectedTemplate || isGenerating}
                    >
                        {isGenerating ? 'Generating...' : 'Use This Logo'}
                    </button>
                    <button className={styles.cancelBtn} onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
