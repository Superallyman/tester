"use client"

// "Report a problem" link for any question. Opens a short form inline; reports go to the admins' queue.

import React, { useState } from 'react';
import { api } from '@/utils/api';

const REASONS = [
    { value: 'wrong_answer', label: 'Answer key is wrong' },
    { value: 'unclear', label: 'Question is unclear' },
    { value: 'typo', label: 'Typo or formatting' },
    { value: 'outdated', label: 'Out of date' },
    { value: 'other', label: 'Something else' },
];

export default function ReportQuestion({ questionId }: { questionId: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [error, setError] = useState<string | null>(null);

    if (state === 'sent') {
        return <span className="orbit-label" style={{ color: 'var(--orbit-good)', opacity: 1, textTransform: 'none', letterSpacing: '0.04em' }}>✓ Reported. Thanks, an admin will take a look.</span>;
    }

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="orbit-label"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⚑ Report a problem
            </button>
        );
    }

    const send = async () => {
        if (!reason) { setError('Pick what is wrong.'); return; }
        if (reason === 'other' && !comment.trim()) { setError('Say what the problem is.'); return; }
        setState('sending');
        setError(null);
        try {
            await api(`/api/questions/${questionId}/report`, { body: { reason, comment } });
            setState('sent');
        } catch (e) {
            setError((e as Error).message);
            setState('idle');
        }
    };

    return (
        // Keys typed here are for the form, not the quiz's keyboard shortcuts
        <div onKeyDown={e => e.stopPropagation()} className="orbit-card orbit-stack"
            style={{ width: '100%', marginTop: 10, gap: 10, boxShadow: 'inset 3px 0 0 var(--orbit-bad), var(--orbit-glass-shadow)' }}>
            <span className="orbit-label">What&apos;s wrong with this question?</span>
            <div role="radiogroup" className="orbit-row" style={{ gap: 6 }}>
                {REASONS.map(r => (
                    <button key={r.value} role="radio" aria-checked={reason === r.value} onClick={() => setReason(r.value)}
                        className={`orbit-chip ${reason === r.value ? 'is-on' : ''}`}
                        style={reason === r.value ? { borderColor: 'var(--orbit-bad)', boxShadow: '0 0 12px color-mix(in srgb, var(--orbit-bad) 35%, transparent)' } : undefined}>
                        {r.label}
                    </button>
                ))}
            </div>
            <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000} rows={2} className="orbit-input"
                placeholder={reason === 'wrong_answer' ? 'Which answer should it be, and why? A source helps.' : 'Details (optional)'}
                style={{ fontSize: '0.88rem' }} />
            {error && <div role="alert" className="orbit-muted" style={{ color: 'var(--orbit-bad)' }}>{error}</div>}
            <div className="orbit-row" style={{ justifyContent: 'flex-end' }}>
                <button onClick={() => { setOpen(false); setError(null); }} className="orbit-btn">Cancel</button>
                <button onClick={send} disabled={state === 'sending'} className="orbit-btn orbit-btn--danger">
                    {state === 'sending' ? 'Sending…' : 'Send report'}
                </button>
            </div>
        </div>
    );
}
