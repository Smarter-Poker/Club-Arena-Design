/**
 * ♠ CLUB ARENA — Avatar Service
 * Integrates with smarter.poker/hub/avatars-complete system
 * 
 * Avatars are stored in Supabase and can be:
 * - Pre-made avatars from the library (70 available)
 * - Custom AI-generated avatars (requires login)
 */

import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Avatar {
    id: string;
    name: string;
    imageUrl: string;
    category: 'free' | 'vip' | 'custom';
    isOwned: boolean;
}

export interface UserAvatar {
    userId: string;
    avatarId: string;
    avatarUrl: string;
    displayName: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVATAR LIBRARY (70 Pre-made Avatars)
// These match the Hub's avatar library at smarter.poker/hub/avatars-complete
// ═══════════════════════════════════════════════════════════════════════════════

const AVATAR_LIBRARY: Omit<Avatar, 'isOwned'>[] = [
    // Free Avatars
    { id: 'retro-rockstar', name: 'Retro Rockstar', imageUrl: '/avatars/retro-rockstar.png', category: 'free' },
    { id: 'master-chef', name: 'Master Chef', imageUrl: '/avatars/master-chef.png', category: 'free' },
    { id: 'lab-scientist', name: 'Lab Scientist', imageUrl: '/avatars/lab-scientist.png', category: 'free' },
    { id: 'pop-star', name: 'Pop Star', imageUrl: '/avatars/pop-star.png', category: 'free' },
    { id: 'space-explorer', name: 'Space Explorer', imageUrl: '/avatars/space-explorer.png', category: 'free' },
    { id: 'lucky-rabbit', name: 'Lucky Rabbit', imageUrl: '/avatars/lucky-rabbit.png', category: 'free' },
    { id: 'wise-owl', name: 'Wise Owl', imageUrl: '/avatars/wise-owl.png', category: 'free' },
    { id: 'sly-fox', name: 'Sly Fox', imageUrl: '/avatars/sly-fox.png', category: 'free' },
    { id: 'cool-penguin', name: 'Cool Penguin', imageUrl: '/avatars/cool-penguin.png', category: 'free' },
    { id: 'poker-shark', name: 'Poker Shark', imageUrl: '/avatars/poker-shark.png', category: 'free' },

    // VIP Avatars
    { id: 'tech-mogul', name: 'Tech Mogul', imageUrl: '/avatars/tech-mogul.png', category: 'vip' },
    { id: 'aerospace-pioneer', name: 'Aerospace Pioneer', imageUrl: '/avatars/aerospace-pioneer.png', category: 'vip' },
    { id: 'liberty-statue', name: 'Liberty Statue', imageUrl: '/avatars/liberty-statue.png', category: 'vip' },
    { id: 'royal-monarch', name: 'Royal Monarch', imageUrl: '/avatars/royal-monarch.png', category: 'vip' },
    { id: 'golden-dragon', name: 'Golden Dragon', imageUrl: '/avatars/golden-dragon.png', category: 'vip' },
];

// Default avatar for users without a selection
const DEFAULT_AVATAR_URL = '/avatars/default-player.png';

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

class AvatarServiceClass {

    /**
     * Get the Hub avatar page URL for embedding or navigation
     */
    getHubAvatarUrl(): string {
        return 'https://smarter.poker/hub/avatars-complete';
    }

    /**
     * Get all available avatars from the library
     */
    async getAvatarLibrary(userId?: string): Promise<Avatar[]> {
        // In the future, this could fetch from Supabase to check ownership
        return AVATAR_LIBRARY.map(avatar => ({
            ...avatar,
            isOwned: avatar.category === 'free', // Free avatars are always owned
        }));
    }

    /**
     * Get a user's current avatar URL
     */
    async getUserAvatarUrl(userId: string): Promise<string> {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('avatar_url')
                .eq('id', userId)
                .single();

            if (error || !data?.avatar_url) {
                return DEFAULT_AVATAR_URL;
            }

            return data.avatar_url;
        } catch {
            return DEFAULT_AVATAR_URL;
        }
    }

    /**
     * Get avatars for multiple users (for table display)
     */
    async getUserAvatars(userIds: string[]): Promise<Map<string, string>> {
        const avatarMap = new Map<string, string>();

        if (userIds.length === 0) return avatarMap;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, avatar_url, display_name')
                .in('id', userIds);

            if (!error && data) {
                for (const profile of data) {
                    avatarMap.set(profile.id, profile.avatar_url || DEFAULT_AVATAR_URL);
                }
            }
        } catch {
            // Fall back to default avatars
        }

        // Set default for any missing users
        for (const userId of userIds) {
            if (!avatarMap.has(userId)) {
                avatarMap.set(userId, DEFAULT_AVATAR_URL);
            }
        }

        return avatarMap;
    }

    /**
     * Update user's avatar
     */
    async setUserAvatar(userId: string, avatarUrl: string): Promise<boolean> {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', userId);

            return !error;
        } catch {
            return false;
        }
    }

    /**
     * Open the Hub avatar selector in a new tab/modal
     * The Hub will handle avatar selection and save to the user's profile
     */
    openAvatarSelector(): void {
        window.open(this.getHubAvatarUrl(), '_blank', 'width=800,height=600');
    }

    /**
     * Check if a user has VIP access for premium avatars
     */
    async hasVipAccess(userId: string): Promise<boolean> {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('is_vip')
                .eq('id', userId)
                .single();

            return data?.is_vip || false;
        } catch {
            return false;
        }
    }
}

export const avatarService = new AvatarServiceClass();
export default avatarService;
