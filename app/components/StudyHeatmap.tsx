"use client"

// Calendar of up to the last 26 weeks, one square per day, darker for more questions answered.
// Drawn at the element's real width: squares fill it (up to a size cap) and narrow screens show fewer weeks
// rather than shrinking everything, so labels stay a readable 12px.
// Ordinal blue ramp (validated light & dark: one hue, monotone lightness, low end clears the surface).
// Hovering, focusing or tapping a day shows its numbers in the line under the grid.

import React, { useMemo, useState } from 'react';
import { DayCount } from './useProgress';
import { useElementWidth } from './useElementWidth';

const MAX_WEEKS = 26, MIN_WEEKS = 8;
const GAP = 3, LEFT = 36, TOP = 22, MIN_STEP = 17, MAX_STEP = 26, FONT = 13;

// Answers per day for each level; 0 is its own neutral level
const LEVELS = [
    { min: 1, label: '1–9' },
    { min: 10, label: '10–24' },
    { min: 25, label: '25–49' },
    { min: 50, label: '50+' },
];
// Tailwind classes so the ramp switches with the app's dark mode
const FILL = [
    'fill-black/[0.06] dark:fill-white/[0.08]',
    'fill-[#86b6ef] dark:fill-[#184f95]',
    'fill-[#3987e5] dark:fill-[#2a78d6]',
    'fill-[#1c5cab] dark:fill-[#6da7ec]',
    'fill-[#0d366b] dark:fill-[#b7d3f6]',
];
const levelOf = (n: number) => (n <= 0 ? 0 : LEVELS.filter(l => n >= l.min).length);

const addDays = (key: string, n: number) => {
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const weekday = (key: string) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
const fmt = (key: string, opts: Intl.DateTimeFormatOptions) => new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

export default function StudyHeatmap({ days, today }: { days: DayCount[]; today: string }) {
    const [focus, setFocus] = useState<string | null>(null);
    const byDay = useMemo(() => new Map(days.map(d => [d.day, d])), [days]);
    const [wrapRef, measured] = useElementWidth<HTMLDivElement>();
    const avail = measured || 720;
    const WEEKS = Math.max(MIN_WEEKS, Math.min(MAX_WEEKS, Math.floor((avail - LEFT) / MIN_STEP)));
    const STEP = Math.min(MAX_STEP, (avail - LEFT) / WEEKS);
    const CELL = STEP - GAP;

    // Columns are Monday-start weeks; the last column holds today
    const start = addDays(today, -(weekday(today) + (WEEKS - 1) * 7));
    const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i)).filter(k => k <= today);
    const inView = days.filter(d => d.day >= start);
    // A month's label sits over the week its 1st falls in
    const months = cells.flatMap((k, i) => (k.endsWith('-01') ? [{ key: k, col: Math.floor(i / 7) }] : []));

    const total = inView.reduce((s, d) => s + d.answered, 0);
    const activeDays = inView.filter(d => d.answered > 0).length;
    const shown = focus ? byDay.get(focus) : null;

    const W = LEFT + WEEKS * STEP, H = TOP + 7 * STEP;
    return (
        <figure style={{ margin: 0 }}>
            <figcaption style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                <strong>Study activity</strong>
                <span style={{ fontSize: '0.85rem', opacity: 0.75 }}>{total} answers on {activeDays} day{activeDays === 1 ? '' : 's'} in the last {WEEKS} weeks</span>
            </figcaption>
            <div ref={wrapRef}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                role="img" aria-label={`Answers per day for the last ${WEEKS} weeks: ${total} answers on ${activeDays} days`}>
                {months.map(m => (
                    <text key={m.key} x={LEFT + m.col * STEP} y={13} fontSize={FONT} fill="currentColor" opacity={0.6}>{fmt(m.key, { month: 'short' })}</text>
                ))}
                {['Mon', 'Wed', 'Fri'].map((d, i) => (
                    <text key={d} x={0} y={TOP + (i * 2) * STEP + CELL / 2 + FONT / 3} fontSize={FONT} fill="currentColor" opacity={0.6}>{d}</text>
                ))}
                {cells.map((k, i) => {
                    const n = byDay.get(k)?.answered ?? 0;
                    return (
                        <rect key={k} x={LEFT + Math.floor(i / 7) * STEP} y={TOP + weekday(k) * STEP} width={CELL} height={CELL} rx={2}
                            className={FILL[levelOf(n)]}
                            stroke={k === focus ? 'currentColor' : k === today ? '#2a78d6' : 'none'} strokeWidth={k === focus || k === today ? 1.5 : 0}
                            tabIndex={-1}
                            onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(f => (f === k ? null : f))} onClick={() => setFocus(k)}>
                            <title>{`${fmt(k, { weekday: 'short', month: 'short', day: 'numeric' })}: ${n} answered`}</title>
                        </rect>
                    );
                })}
            </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '6px', fontSize: '0.8rem' }}>
                <span aria-live="polite" style={{ opacity: 0.8, minHeight: '1.2em' }}>
                    {focus
                        ? `${fmt(focus, { weekday: 'long', month: 'long', day: 'numeric' })}: ${shown ? `${shown.answered} answered, ${Math.round((shown.correct / shown.answered) * 100)}% correct` : 'no practice'}`
                        : 'Hover or tap a day for details'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} aria-label="Legend: darker squares mean more answers">
                    <span style={{ opacity: 0.8 }}>Less</span>
                    <svg width={5 * 17} height={14} aria-hidden="true">
                        {FILL.map((c, i) => <rect key={i} x={i * 17} y={0} width={14} height={14} rx={2} className={c}><title>{i === 0 ? 'none' : LEVELS[i - 1].label}</title></rect>)}
                    </svg>
                    <span style={{ opacity: 0.8 }}>More</span>
                </span>
            </div>
        </figure>
    );
}
