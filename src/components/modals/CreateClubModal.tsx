/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CreateClubModal — Club Creation Popup
 * ═══════════════════════════════════════════════════════════════════════════════
 * Modal for creating a new club with:
 * - Club name input
 * - Logo upload or AI generation
 * - Terms acceptance checkbox
 * - Generates club card with overlaid Club ID and name
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

// Club card frame template (without logo - just the frame)
const CARD_FRAME_URL = `${import.meta.env.BASE_URL}images/frames/club-card-frame.png`;

export default function CreateClubModal({ isOpen, onClose, onSuccess }: CreateClubModalProps) {
    const { user } = useUserStore();
    const toast = useToast();

    const [clubName, setClubName] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [hasAgreed, setHasAgreed] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [showLogoGenerator, setShowLogoGenerator] = useState(false);
    const [generatedCardPreview, setGeneratedCardPreview] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Generate preview when logo or name changes
    useEffect(() => {
        if (logoPreview && clubName.trim()) {
            generateCardPreview();
        }
    }, [logoPreview, clubName]);

    const generateCardPreview = async () => {
        if (!logoPreview || !clubName.trim()) return;

        try {
            // Generate a temporary club ID for preview
            const tempClubId = Math.floor(10000 + Math.random() * 90000);
            const cardDataUrl = await ClubCardGenerator.generateCard({
                logoUrl: logoPreview,
                clubId: tempClubId,
                clubName: clubName.trim().toUpperCase(),
            });
            setGeneratedCardPreview(cardDataUrl);
        } catch (err) {
            console.error('Failed to generate preview:', err);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be less than 5MB');
            return;
        }

        setLogoFile(file);

        // Create preview URL
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
            // Generate 5-digit club ID
            const clubIdNumber = Math.floor(10000 + Math.random() * 90000);

            // Generate final club card image
            const cardDataUrl = await ClubCardGenerator.generateCard({
                logoUrl: logoPreview,
                clubId: clubIdNumber,
                clubName: clubName.trim().toUpperCase(),
            });

            // Convert data URL to blob for upload
            const cardBlob = await fetch(cardDataUrl).then(r => r.blob());
            const cardFileName = `club-cards/${clubIdNumber}-card.png`;

            // Upload card image to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('club-assets')
                .upload(cardFileName, cardBlob, {
                    contentType: 'image/png',
                    upsert: true,
                });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                // Continue without card image if upload fails
            }

            // Get public URL for card
            let cardUrl = null;
            if (uploadData) {
                const { data: urlData } = supabase.storage
                    .from('club-assets')
                    .getPublicUrl(cardFileName);
                cardUrl = urlData.publicUrl;
            }

            // Create club in database
            const { data: clubData, error: insertError } = await supabase
                .from('clubs')
                .insert({
                    club_id: clubIdNumber,
                    name: clubName.trim(),
                    owner_id: user?.id,
                    is_public: true,
                    requires_approval: true,
                    card_image_url: cardUrl,
                    logo_url: cardUrl, // Use card as logo for now
                    member_count: 1,
                    level: 1,
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

            // Reset form
            setClubName('');
            setLogoFile(null);
            setLogoPreview(null);
            setGeneratedCardPreview(null);
            setHasAgreed(false);

            onClose();
            onSuccess?.(clubData.id);

            // Reload to show new club
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
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Close button */}
                <button className={styles.closeButton} onClick={onClose}>
                    ✕
                </button>

                {/* Title */}
                <h2 className={styles.title}>CREATE A CLUB</h2>

                {/* Club Name Input */}
                <div className={styles.inputGroup}>
                    <label className={styles.label}>CLUB NAME:</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="Enter club name..."
                        value={clubName}
                        onChange={(e) => setClubName(e.target.value)}
                        maxLength={30}
                    />
                </div>

                {/* Logo Section */}
                <div className={styles.logoSection}>
                    {generatedCardPreview ? (
                        <div className={styles.cardPreview}>
                            <img src={generatedCardPreview} alt="Club Card Preview" />
                            <button
                                className={styles.changeLogoBtn}
                                onClick={() => {
                                    setLogoPreview(null);
                                    setGeneratedCardPreview(null);
                                }}
                            >
                                Change Logo
                            </button>
                        </div>
                    ) : (
                        <div className={styles.logoButtons}>
                            <button
                                className={styles.logoBtn}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <span className={styles.plusIcon}>+</span>
                                <span>UPLOAD LOGO</span>
                            </button>
                            <button
                                className={styles.logoBtn}
                                onClick={() => setShowLogoGenerator(true)}
                            >
                                <span className={styles.createIcon}>🎨</span>
                                <span>CREATE LOGO</span>
                            </button>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className={styles.hiddenInput}
                        onChange={handleFileSelect}
                    />
                </div>

                {/* Terms Checkbox */}
                <label className={styles.termsCheckbox}>
                    <input
                        type="checkbox"
                        checked={hasAgreed}
                        onChange={(e) => setHasAgreed(e.target.checked)}
                    />
                    <span className={styles.checkmark}></span>
                    <span className={styles.termsText}>
                        By clicking "CREATE" you confirm you are 18+ years old
                        and that you understand and accept Smarter Poker's
                        club promotion rules.
                    </span>
                </label>

                {/* Create Button */}
                <button
                    className={styles.createButton}
                    onClick={handleCreate}
                    disabled={isCreating || !hasAgreed || !clubName.trim() || !logoPreview}
                >
                    {isCreating ? 'CREATING...' : 'CREATE'}
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

            // Generate logo using canvas
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
