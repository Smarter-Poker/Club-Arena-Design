/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  ClubCardGenerator — Canvas-based Club Card Compositing
 * ═══════════════════════════════════════════════════════════════════════════════
 * Generates club cards by:
 * 1. Loading the card frame template
 * 2. Fitting the user's logo into the center area
 * 3. Overlaying Club ID at top
 * 4. Overlaying Club Name at bottom
 * 5. Returns as data URL
 */

interface CardGeneratorOptions {
    logoUrl: string;
    clubId: number;
    clubName: string;
}

// Card dimensions (matching shark-club-card.jpg proportions)
const CARD_WIDTH = 400;
const CARD_HEIGHT = 600;

// Logo area dimensions and position
const LOGO_X = 30;
const LOGO_Y = 120;
const LOGO_WIDTH = 340;
const LOGO_HEIGHT = 300;

// Text positions
const CLUB_ID_Y = 60;
const CLUB_NAME_Y = 460;

export class ClubCardGenerator {
    /**
     * Generate a complete club card with logo, ID, and name
     */
    static async generateCard(options: CardGeneratorOptions): Promise<string> {
        const { logoUrl, clubId, clubName } = options;

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = CARD_WIDTH;
        canvas.height = CARD_HEIGHT;
        const ctx = canvas.getContext('2d')!;

        // Draw dark metallic background
        await this.drawCardBackground(ctx);

        // Draw logo in center area
        await this.drawLogo(ctx, logoUrl);

        // Draw metallic frame overlay
        await this.drawFrameOverlay(ctx);

        // Draw Club ID at top
        this.drawClubId(ctx, clubId);

        // Draw Club Name at bottom
        this.drawClubName(ctx, clubName);

        // Draw stats bar at bottom (static template)
        this.drawStatsBar(ctx);

        return canvas.toDataURL('image/png');
    }

    /**
     * Draw the dark metallic card background
     */
    private static async drawCardBackground(ctx: CanvasRenderingContext2D) {
        // Dark gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
        gradient.addColorStop(0, '#1a2744');
        gradient.addColorStop(0.5, '#0d1b2a');
        gradient.addColorStop(1, '#1a2744');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        // Add subtle metallic sheen
        ctx.fillStyle = 'rgba(100, 150, 200, 0.05)';
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }

    /**
     * Draw the user's logo, scaled to fit the center area
     */
    private static async drawLogo(ctx: CanvasRenderingContext2D, logoUrl: string) {
        return new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                // Calculate scaling to fit within logo area while maintaining aspect ratio
                const scale = Math.min(LOGO_WIDTH / img.width, LOGO_HEIGHT / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;

                // Center the logo in the logo area
                const x = LOGO_X + (LOGO_WIDTH - scaledWidth) / 2;
                const y = LOGO_Y + (LOGO_HEIGHT - scaledHeight) / 2;

                // Draw with slight shadow for depth
                ctx.shadowColor = 'rgba(0, 200, 255, 0.3)';
                ctx.shadowBlur = 20;
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                ctx.shadowBlur = 0;

                resolve();
            };

            img.onerror = () => {
                console.error('Failed to load logo image');
                resolve();
            };

            img.src = logoUrl;
        });
    }

    /**
     * Draw metallic frame overlay around the card
     */
    private static async drawFrameOverlay(ctx: CanvasRenderingContext2D) {
        // Top bar
        const topGradient = ctx.createLinearGradient(0, 0, 0, 90);
        topGradient.addColorStop(0, '#4a5568');
        topGradient.addColorStop(0.5, '#2d3748');
        topGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = topGradient;
        ctx.fillRect(0, 0, CARD_WIDTH, 90);

        // Bottom bar
        const bottomGradient = ctx.createLinearGradient(0, CARD_HEIGHT - 150, 0, CARD_HEIGHT);
        bottomGradient.addColorStop(0, 'transparent');
        bottomGradient.addColorStop(0.3, '#2d3748');
        bottomGradient.addColorStop(1, '#4a5568');
        ctx.fillStyle = bottomGradient;
        ctx.fillRect(0, CARD_HEIGHT - 150, CARD_WIDTH, 150);

        // Side accents
        ctx.fillStyle = 'rgba(0, 200, 255, 0.15)';
        ctx.fillRect(0, 100, 8, CARD_HEIGHT - 200);
        ctx.fillRect(CARD_WIDTH - 8, 100, 8, CARD_HEIGHT - 200);

        // Glowing border
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20);
    }

    /**
     * Draw Club ID text at top
     */
    private static drawClubId(ctx: CanvasRenderingContext2D, clubId: number) {
        ctx.font = 'bold 28px "Orbitron", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text shadow/glow
        ctx.shadowColor = 'rgba(0, 200, 255, 0.8)';
        ctx.shadowBlur = 10;

        // Main text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`CLUB ID: ${clubId}`, CARD_WIDTH / 2, CLUB_ID_Y);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw Club Name text at bottom
     */
    private static drawClubName(ctx: CanvasRenderingContext2D, clubName: string) {
        // Calculate font size based on name length
        let fontSize = 36;
        if (clubName.length > 15) fontSize = 28;
        if (clubName.length > 20) fontSize = 24;

        ctx.font = `bold ${fontSize}px "Orbitron", "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text shadow/glow
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 8;

        // Main text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(clubName, CARD_WIDTH / 2, CLUB_NAME_Y);

        ctx.shadowBlur = 0;
    }

    /**
     * Draw stats bar at bottom (Total Members | Club Level | Active Players)
     */
    private static drawStatsBar(ctx: CanvasRenderingContext2D) {
        const barY = CARD_HEIGHT - 80;
        const barHeight = 60;

        // Stats bar background
        ctx.fillStyle = '#1a2744';
        ctx.fillRect(15, barY, CARD_WIDTH - 30, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(15, barY, CARD_WIDTH - 30, barHeight);

        // Dividers
        ctx.fillStyle = 'rgba(0, 200, 255, 0.3)';
        ctx.fillRect(CARD_WIDTH / 3, barY + 10, 1, barHeight - 20);
        ctx.fillRect((CARD_WIDTH / 3) * 2, barY + 10, 1, barHeight - 20);

        // Labels (top row)
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.fillStyle = '#8899aa';
        ctx.textAlign = 'center';
        ctx.fillText('TOTAL', CARD_WIDTH / 6, barY + 18);
        ctx.fillText('MEMBERS', CARD_WIDTH / 6, barY + 28);
        ctx.fillText('CLUB LEVEL', CARD_WIDTH / 2, barY + 23);
        ctx.fillText('ACTIVE', (CARD_WIDTH / 6) * 5, barY + 18);
        ctx.fillText('PLAYERS', (CARD_WIDTH / 6) * 5, barY + 28);

        // Values (bottom row) - These will be dynamically replaced in UI
        ctx.font = 'bold 20px "Orbitron", "Segoe UI", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('1', CARD_WIDTH / 6, barY + 48);
        ctx.fillText('1', CARD_WIDTH / 2, barY + 48);
        ctx.fillText('1', (CARD_WIDTH / 6) * 5, barY + 48);
    }
}
