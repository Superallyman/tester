"use client"

// Everyone's first-try results for a set of questions, loaded in one request

import { useEffect, useState } from 'react';
import { api } from '@/utils/api';

export interface DifficultyStat { people: number; first_correct: number }

export function useDifficulty(questionIds: string[], enabled = true) {
    const [stats, setStats] = useState<Record<string, DifficultyStat>>({});
    const key = enabled ? questionIds.join(',') : '';
    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        api<({ question_id: string } & DifficultyStat)[]>('/api/questions/difficulty', { body: { ids: key.split(',') } })
            .then(rows => { if (!cancelled) setStats(Object.fromEntries(rows.map(({ question_id, ...s }) => [question_id, s]))); })
            .catch(console.error);
        return () => { cancelled = true; };
    }, [key]);
    return stats;
}
