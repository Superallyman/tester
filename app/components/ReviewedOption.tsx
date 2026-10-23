// One answer option after the question is marked, as shown in Quick Test results and History:
// your pick is tinted green or red, a correct answer you didn't pick is outlined, and each says so in words.

import React from 'react';

const GREEN = '#10b981', RED = '#ef4444';

export default function ReviewedOption({ text, letter, picked, correct }: { text: string; letter?: string; picked: boolean; correct: boolean }) {
    const tone = picked ? (correct ? GREEN : RED) : correct ? GREEN : null;
    const note = picked ? (correct ? 'Your answer ✓' : 'Your answer ✕') : correct ? 'Correct answer' : null;
    return (
        <div style={{
            padding: '10px 12px', borderRadius: '8px', fontSize: '0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            border: tone ? `${picked ? 'solid' : 'dashed'} 1.5px ${tone}` : '1px solid rgba(128,128,128,0.2)',
            background: picked ? (correct ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)') : 'transparent',
        }}>
            <span>
                {letter && <span style={{ fontWeight: 'bold', opacity: 0.6, marginRight: '10px' }}>{letter}.</span>}
                {text}
            </span>
            {note && <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: 'bold', color: tone! }}>{note}</span>}
        </div>
    );
}
