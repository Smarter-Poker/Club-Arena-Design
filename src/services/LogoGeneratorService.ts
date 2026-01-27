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
                quality: 'standard',
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
 * Build a detailed prompt for generating a poker club logo
 */
function buildLogoPrompt(clubName: string, style: string, theme?: string, colorScheme?: string): string {
    // Base prompt with specific requirements for club logos
    let prompt = `Create a professional poker club logo for "${clubName}". `;

    // Style-specific instructions
    const styleInstructions: Record<string, string> = {
        modern: 'Use clean lines, geometric shapes, and a sleek contemporary design. Minimalist but impactful.',
        classic: 'Use traditional poker imagery like suits, chips, and cards. Vintage elegance with gold accents.',
        aggressive: 'Bold, powerful design with sharp angles and intense imagery. Convey strength and dominance.',
        elegant: 'Sophisticated and luxurious look with refined details. Premium feel with subtle metallic accents.',
        playful: 'Fun and energetic design with vibrant colors and dynamic elements. Approachable but professional.',
    };
    prompt += styleInstructions[style] || styleInstructions.modern;

    // Theme element
    if (theme) {
        prompt += ` Incorporate a ${theme} as the central visual element. `;
    }

    // Color scheme
    if (colorScheme) {
        prompt += ` Use a ${colorScheme} color palette. `;
    }

    // Technical requirements for the output
    prompt += `
        IMPORTANT REQUIREMENTS:
        - Square format, centered composition
        - Dark background (navy blue or black) that works well on dark UI
        - High contrast for visibility at small sizes
        - No text or letters in the logo (club name will be added separately)
        - Professional esports/gaming aesthetic
        - Suitable for a poker club card design
        - Icon-style logo with clean edges
        - Glowing or metallic accents appreciated
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
