"use client"

// Today's practice against the daily goal, with streaks. Shown above Quick Smart Review.

import React, { useState } from 'react';
import { Flame, Target } from 'lucide-react';
import { useProgress } from './useProgress';

const card: React.CSSProperties = {
    padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(128,128,128,0.2)', background: 'rgba(128,128,128,0.05)',
    marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px',
};

export default function DailyProgress() {
    const { progress, setGoal } = useProgress();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState<string | null>(null);

    if (!progress) return null;
    const { goal, todayCount, streak, goalStreak } = progress;
    const done = goal ? Math.min(1, todayCount / goal) : 0;

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
        <section aria-label="Today's practice" style={card}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', letterSpacing: '0.06em', opacity: 0.6, fontWeight: 600 }}>TODAY</span>
                    {!editing && (
                        <button onClick={() => { setDraft(goal ? String(goal) : '20'); setEditing(true); }}
                            style={{ background: 'none', border: 'none', padding: 0, color: '#3b82f6', cursor: 'pointer', fontSize: '0.75rem' }}>
                            {goal ? 'Change goal' : 'Set a daily goal'}
                        </button>
                    )}
                </div>
                {editing ? (
                    <form onSubmit={e => { e.preventDefault(); save(parseInt(draft, 10)); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <label htmlFor="daily-goal" style={{ fontSize: '0.85rem' }}>Answer</label>
                        <input id="daily-goal" type="number" min={1} max={500} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
                            style={{ width: '70px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.4)', background: 'transparent', color: 'inherit' }} />
                        <span style={{ fontSize: '0.85rem' }}>questions a day</span>
                        <button type="submit" style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', background: '#0070f3', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                        {goal && <button type="button" onClick={() => save(null)} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', fontSize: '0.8rem' }}>Remove goal</button>}
                        <button type="button" onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                        {error && <span role="alert" style={{ color: '#ef4444', fontSize: '0.8rem', width: '100%' }}>{error}</span>}
                    </form>
                ) : goal ? (
                    <>
                        <div style={{ fontSize: '1.05rem', marginTop: '4px' }}>
                            <strong>{todayCount}</strong> of {goal} questions{todayCount >= goal ? ' · goal met ✓' : ''}
                        </div>
                        <div role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(todayCount, goal)} aria-label="Daily goal"
                            style={{ height: '8px', borderRadius: '4px', background: 'rgba(128,128,128,0.2)', overflow: 'hidden', marginTop: '6px' }}>
                            <div style={{ height: '100%', width: `${done * 100}%`, background: todayCount >= goal ? '#10b981' : '#2a78d6', borderRadius: '4px', transition: 'width 0.4s' }} />
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: '1.05rem', marginTop: '4px' }}><strong>{todayCount}</strong> question{todayCount === 1 ? '' : 's'} answered</div>
                )}
            </div>
            <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem' }}>
                <span title="Days in a row with at least one answer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Flame size={18} aria-hidden="true" color={streak ? '#f59e0b' : 'currentColor'} style={{ opacity: streak ? 1 : 0.4 }} />
                    <span><strong>{streak}</strong>-day streak</span>
                </span>
                {goal && (
                    <span title="Days in a row that met your goal" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Target size={18} aria-hidden="true" color={goalStreak ? '#10b981' : 'currentColor'} style={{ opacity: goalStreak ? 1 : 0.4 }} />
                        <span><strong>{goalStreak}</strong> goal day{goalStreak === 1 ? '' : 's'} running</span>
                    </span>
                )}
            </div>
        </section>
    );
}
