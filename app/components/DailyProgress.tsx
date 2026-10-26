"use client"

// Today's practice against the daily goal, with streaks. Shown above Quick Smart Review.
// While loading it shows a skeleton of the same size, so the page below doesn't jump.

import React, { useState } from 'react';
import { Flame, Target } from 'lucide-react';
import { useProgress } from './useProgress';

// Same box in both states
const CARD_STYLE: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 28px', marginBottom: '1.5rem', boxSizing: 'border-box' };

// The skeleton is the loaded card's own markup with its text ghosted, so it is the same size at any font size
const Ghost = ({ children }: { children: React.ReactNode }) => <span className="orbit-skeleton orbit-skeleton--ghost">{children}</span>;

export function DailyProgressSkeleton() {
    return (
        <section aria-hidden="true" className="orbit-card" style={CARD_STYLE}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span className="orbit-label"><Ghost>Today</Ghost></span>
                    <span className="orbit-btn orbit-btn--ghost" style={{ borderBottomColor: 'transparent' }}><Ghost>Change goal</Ghost></span>
                </div>
                <div className="orbit-body" style={{ fontSize: '1.05rem', marginTop: 6 }}><Ghost>00 of 20 questions</Ghost></div>
                <div className="orbit-progress" style={{ marginTop: 10 }} />
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: '0.85rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flame size={17} aria-hidden="true" style={{ opacity: 0.2 }} /><Ghost>0-day streak</Ghost></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Target size={17} aria-hidden="true" style={{ opacity: 0.2 }} /><Ghost>0 goal days running</Ghost></span>
            </div>
        </section>
    );
}

export default function DailyProgress() {
    const { progress, setGoal } = useProgress();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!progress) return <DailyProgressSkeleton />;
    const { goal, todayCount, streak, goalStreak } = progress;

    const save = async (value: number | null) => {
        setError(null);
        try {
            await setGoal(value);
            setEditing(false);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <section aria-label="Today's practice" className="orbit-card" style={CARD_STYLE}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span className="orbit-label">Today</span>
                    {!editing && (
                        <button onClick={() => { setDraft(goal ? String(goal) : '20'); setEditing(true); }} className="orbit-btn orbit-btn--ghost">
                            {goal ? 'Change goal' : 'Set a daily goal'}
                        </button>
                    )}
                </div>
                {editing ? (
                    <form onSubmit={e => { e.preventDefault(); save(parseInt(draft, 10)); }} className="orbit-row" style={{ marginTop: 8 }}>
                        <label htmlFor="daily-goal" className="orbit-body">Answer</label>
                        <input id="daily-goal" type="number" min={1} max={500} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                            className="orbit-input" style={{ width: 80, padding: '6px 10px' }} />
                        <span className="orbit-body">questions a day</span>
                        <button type="submit" className="orbit-btn orbit-btn--primary" style={{ padding: '7px 14px' }}>Save</button>
                        {goal && <button type="button" onClick={() => save(null)} className="orbit-btn orbit-btn--ghost">Remove goal</button>}
                        <button type="button" onClick={() => setEditing(false)} className="orbit-btn orbit-btn--ghost">Cancel</button>
                        {error && <span role="alert" className="orbit-muted" style={{ color: 'var(--orbit-bad)', width: '100%' }}>{error}</span>}
                    </form>
                ) : goal ? (
                    <>
                        <div className="orbit-body" style={{ fontSize: '1.05rem', marginTop: 6 }}>
                            <strong style={{ fontWeight: 600 }}>{todayCount}</strong> of {goal} questions{todayCount >= goal ? ' · goal met ✓' : ''}
                        </div>
                        <div role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(todayCount, goal)} aria-label="Daily goal"
                            className={`orbit-progress ${todayCount >= goal ? 'orbit-progress--good' : ''}`} style={{ marginTop: 10 }}>
                            <span style={{ width: `${Math.min(1, todayCount / goal) * 100}%`, transition: 'width 0.4s' }} />
                        </div>
                    </>
                ) : (
                    <div className="orbit-body" style={{ fontSize: '1.05rem', marginTop: 6 }}><strong style={{ fontWeight: 600 }}>{todayCount}</strong> question{todayCount === 1 ? '' : 's'} answered</div>
                )}
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: '0.85rem' }}>
                <span title="Days in a row with at least one answer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Flame size={17} aria-hidden="true" color={streak ? 'var(--orbit-warn)' : 'currentColor'} style={{ opacity: streak ? 1 : 0.4 }} />
                    <span><strong style={{ fontWeight: 600 }}>{streak}</strong>-day streak</span>
                </span>
                {goal && (
                    <span title="Days in a row that met your goal" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Target size={17} aria-hidden="true" color={goalStreak ? 'var(--orbit-good)' : 'currentColor'} style={{ opacity: goalStreak ? 1 : 0.4 }} />
                        <span><strong style={{ fontWeight: 600 }}>{goalStreak}</strong> goal day{goalStreak === 1 ? '' : 's'} running</span>
                    </span>
                )}
            </div>
        </section>
    );
}
