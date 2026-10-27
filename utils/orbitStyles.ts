// Orbit kit surfaces as inline styles, for components that build their styles in code.
// Same look as the .orbit-card / .orbit-glass classes (app/design/orbit/orbit.css), driven by its CSS variables.

import type { CSSProperties } from 'react';

// Border as separate properties, not the "border" shorthand: callers override borderColor for a selected state,
// and React warns (and can leave stale styles) when a shorthand and its longhand are mixed across re-renders
export const glass: CSSProperties = {
    background: 'linear-gradient(180deg, var(--orbit-glass-top), var(--orbit-glass-bottom))',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--orbit-glass-border)',
    boxShadow: 'inset 0 1px 0 var(--orbit-glass-edge), var(--orbit-glass-shadow)',
    backdropFilter: 'blur(var(--orbit-blur)) saturate(140%)',
    WebkitBackdropFilter: 'blur(var(--orbit-blur)) saturate(140%)',
    borderRadius: 'var(--orbit-radius)',
};

export const glassCard: CSSProperties = { ...glass, padding: '1.25rem' };

/** Tracked uppercase label, as .orbit-label */
export const label: CSSProperties = {
    fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--orbit-ink-soft)',
};

/** Coloured edge and soft glow for a surface that carries a state colour */
export const edge = (color: string): CSSProperties => ({
    boxShadow: `inset 3px 0 0 ${color}, 0 0 14px color-mix(in srgb, ${color} 16%, transparent), var(--orbit-glass-shadow)`,
});
