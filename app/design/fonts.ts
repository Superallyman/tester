// Candidate typefaces for the design pages. Loaded only under /design; nothing else in the app uses them.
import { Barlow, Inter, Space_Grotesk } from 'next/font/google';

// Closest open stand-in for Apple's SF Pro
export const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap' });
// Squared, DIN-like; close to the Tesla and SpaceX feel
export const barlow = Barlow({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap' });
// Geometric with a technical edge
export const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap' });

export const FONTS = [
    { key: 'system', code: 'F1', label: 'Arial (current)', className: '' },
    { key: 'inter', code: 'F2', label: 'Inter (Apple-like)', className: inter.className },
    { key: 'barlow', code: 'F3', label: 'Barlow (Tesla / SpaceX-like)', className: barlow.className },
    { key: 'grotesk', code: 'F4', label: 'Space Grotesk', className: spaceGrotesk.className },
] as const;
