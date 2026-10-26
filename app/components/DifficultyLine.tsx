// "Hard · 1 of 4 people right on their first try". Labelled only once enough people have tried it.

import React from 'react';
import { Users } from 'lucide-react';
import { MIN_PEOPLE, difficultyOf } from '@/utils/difficulty';
import { DifficultyStat } from './useDifficulty';

const LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' } as const;
const COLORS = { easy: 'var(--orbit-good)', medium: 'var(--orbit-warn)', hard: 'var(--orbit-bad)' } as const;

export default function DifficultyLine({ stat }: { stat: DifficultyStat | undefined }) {
    const people = stat?.people ?? 0;
    const level = stat ? difficultyOf(stat.people, stat.first_correct) : null;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--orbit-ink-soft)' }}>
            <Users size={13} aria-hidden="true" />
            {level && <strong style={{ color: COLORS[level] }}>{LABELS[level]}</strong>}
            <span style={{ opacity: 0.8 }}>
                {people === 0 ? 'Nobody else has answered this yet'
                    : `${level ? '· ' : ''}${stat!.first_correct} of ${people} ${people === 1 ? 'person' : 'people'} right on their first try`
                      + (level ? '' : ` · rated once ${MIN_PEOPLE} have tried it`)}
            </span>
        </div>
    );
}
