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
        return <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✓ Reported. Thanks, an admin will take a look.</span>;
    }

    if (!open) {
        return (
            <button onClick={() => setOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: 0.55, fontSize: '0.75rem' }}>
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
        <div onKeyDown={e => e.stopPropagation()}
            style={{ width: '100%', marginTop: '10px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.05)', textAlign: 'left' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '8px' }}>What&apos;s wrong with this question?</div>
            <div role="radiogroup" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {REASONS.map(r => (
                    <button key={r.value} role="radio" aria-checked={reason === r.value} onClick={() => setReason(r.value)}
                        style={{
                            padding: '5px 10px', borderRadius: '14px', fontSize: '0.75rem', cursor: 'pointer',
                            border: reason === r.value ? '1px solid #ef4444' : '1px solid rgba(128,128,128,0.35)',
                            background: reason === r.value ? '#ef4444' : 'transparent', color: reason === r.value ? 'white' : 'inherit',
                        }}>
                        {r.label}
                    </button>
                ))}
            </div>
            <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000} rows={2}
                placeholder={reason === 'wrong_answer' ? 'Which answer should it be, and why? A source helps.' : 'Details (optional)'}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', fontSize: '0.8rem', fontFamily: 'inherit' }} />
            {error && <div role="alert" style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => { setOpen(false); setError(null); }}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(128,128,128,0.35)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: '0.8rem' }}>
                    Cancel
                </button>
                <button onClick={send} disabled={state === 'sending'}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {state === 'sending' ? 'Sending…' : 'Send report'}
                </button>
            </div>
        </div>
    );
}
