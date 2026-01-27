/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  LogoGeneratorService — AI-Powered Club Logo Generation using OpenAI DALL-E
 * ═══════════════════════════════════════════════════════════════════════════════
 * Generates custom club logos using OpenAI's DALL-E image generation API.
 * Outputs square images sized for the ClubCardGenerator (340x340 logo area).
 */

// OpenAI API Configuration
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const OPENAI_API_URL = 'https://api.openai.com/v1/images/generations';

// Logo generation settings
const LOGO_SIZE = '1024x1024'; // DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792
const TARGET_LOGO_SIZE = 340; // Final size for ClubCardGenerator

export interface LogoGenerationOptions {
    clubName: string;
    style?: 'modern' | 'classic' | 'aggressive' | 'elegant' | 'playful';
    theme?: string; // e.g., "shark", "dragon", "phoenix", "poker chips"
    colorScheme?: string; // e.g., "blue and gold", "red and black"
}

export interface LogoGenerationResult {
    success: boolean;
    logoUrl?: string; // Data URL of the generated logo
    error?: string;
}

/**
 * Generate a club logo using OpenAI's DALL-E API
 */
export async function generateClubLogo(options: LogoGenerationOptions): Promise<LogoGenerationResult> {
    const { clubName, style = 'modern', theme, colorScheme } = options;

    // Build a detailed prompt for poker club logo generation
    const prompt = buildLogoPrompt(clubName, style, theme, colorScheme);

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt: prompt,
                n: 1,
                size: LOGO_SIZE,
                quality: 'hd', // HD quality for premium photorealistic images
                response_format: 'b64_json', // Get base64 directly
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('OpenAI API error:', errorData);
            return {
                success: false,
                error: errorData.error?.message || `API error: ${response.status}`,
            };
        }

        const data = await response.json();
        const base64Image = data.data?.[0]?.b64_json;

        if (!base64Image) {
            return {
                success: false,
                error: 'No image data received from API',
            };
        }

        // Convert to data URL and resize to target dimensions
        const fullSizeDataUrl = `data:image/png;base64,${base64Image}`;
        const resizedDataUrl = await resizeImage(fullSizeDataUrl, TARGET_LOGO_SIZE, TARGET_LOGO_SIZE);

        return {
            success: true,
            logoUrl: resizedDataUrl,
        };
    } catch (error) {
        console.error('Logo generation failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
    }
}

/**
 * Build a detailed prompt for generating a PREMIUM poker club image
 * Style: Photorealistic, cyberpunk/sci-fi, like the Shark Club card
 */
function buildLogoPrompt(clubName: string, style: string, theme?: string, colorScheme?: string): string {
    // Premium prompt designed to match the Shark Club card aesthetic
    let prompt = `Create a PHOTOREALISTIC, CINEMATIC image of a ${theme || 'powerful creature'} for a premium poker club. `;

    // Theme-specific descriptions for photorealistic rendering
    const themeDescriptions: Record<string, string> = {
        'shark': 'A massive great white shark swimming through dark water, mouth slightly open showing teeth, powerful and menacing',
        'dragon': 'A detailed dragon head with glowing eyes, scales glistening with metallic sheen, breathing subtle wisps of fire',
        'eagle': 'A majestic bald eagle with piercing golden eyes, feathers detailed and realistic, wings spread',
        'lion': 'A powerful male lion with a full mane, intense golden eyes, regal and commanding presence',
        'phoenix': 'A magnificent phoenix bird engulfed in flowing flames, wings spread wide, rising from embers',
        'wolf': 'A fierce gray wolf with piercing ice-blue eyes, detailed fur texture, howling or snarling',
        'playing cards and poker chips': 'Luxurious poker cards (showing aces) and high-end casino chips arranged elegantly, gold and platinum',
        'royal crown with poker elements': 'An ornate royal crown with embedded jewels, surrounded by poker card suits in gold',
        'diamond gemstone': 'A brilliant-cut diamond gemstone catching light with rainbow refractions, set against dark velvet',
        'skull with poker elements': 'A metallic chrome skull with glowing red eyes, surrounded by poker chips and flames',
        'tiger': 'A powerful Bengal tiger with intense amber eyes, detailed orange and black striped fur, prowling stance',
        'spade suit symbol': 'A 3D rendered spade symbol in polished obsidian with gold edges, floating with reflective lighting',
    };

    const themeDesc = themeDescriptions[theme || ''] || `a powerful, photorealistic ${theme}`;
    prompt += themeDesc + '. ';

    // Cyberpunk/sci-fi environment matching Shark Club style
    prompt += `
        CRITICAL STYLE REQUIREMENTS - MATCH THIS EXACTLY:
        - PHOTOREALISTIC digital art, NOT cartoon, NOT illustrated, NOT anime
        - Cyberpunk/sci-fi underwater or futuristic environment
        - Dramatic lighting: deep blue and purple neon glow colors
        - Dark background with atmospheric fog or particles
        - Cinematic quality like a AAA video game or Hollywood movie
        - The creature/subject fills 70% of the frame
        - Add subtle metallic reflections and lens flares
        - Professional esports/gaming aesthetic
        - Premium, high-end, luxurious feel
        - NO TEXT, NO LETTERS, NO WORDS anywhere in the image
        - Ultra high detail, 8K quality rendering
    `;

    return prompt;
}

/**
 * Resize an image to target dimensions using canvas
 */
async function resizeImage(dataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d')!;

            // Use high-quality image scaling
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Draw the image scaled to target size
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image for resizing'));
        img.src = dataUrl;
    });
}

/**
 * Logo style presets for quick selection
 */
export const LOGO_STYLE_PRESETS = [
    { id: 'shark-modern', name: 'Shark', theme: 'shark', style: 'aggressive' as const, icon: '🦈' },
    { id: 'dragon-classic', name: 'Dragon', theme: 'dragon', style: 'classic' as const, icon: '🐉' },
    { id: 'eagle-elegant', name: 'Eagle', theme: 'eagle', style: 'elegant' as const, icon: '🦅' },
    { id: 'lion-aggressive', name: 'Lion', theme: 'lion', style: 'aggressive' as const, icon: '🦁' },
    { id: 'phoenix-modern', name: 'Phoenix', theme: 'phoenix', style: 'modern' as const, icon: '🔥' },
    { id: 'wolf-classic', name: 'Wolf', theme: 'wolf', style: 'classic' as const, icon: '🐺' },
    { id: 'cards-elegant', name: 'Cards', theme: 'playing cards and poker chips', style: 'elegant' as const, icon: '🂡' },
    { id: 'crown-elegant', name: 'Crown', theme: 'royal crown with poker elements', style: 'elegant' as const, icon: '👑' },
    { id: 'diamond-modern', name: 'Diamond', theme: 'diamond gemstone', style: 'modern' as const, icon: '💎' },
    { id: 'skull-aggressive', name: 'Skull', theme: 'skull with poker elements', style: 'aggressive' as const, icon: '💀' },
    { id: 'tiger-playful', name: 'Tiger', theme: 'tiger', style: 'playful' as const, icon: '🐯' },
    { id: 'spade-classic', name: 'Spade', theme: 'spade suit symbol', style: 'classic' as const, icon: '♠️' },
];
