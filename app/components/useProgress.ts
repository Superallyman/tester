"use client"

// Daily practice counts, streaks and goal for the signed-in user (/api/progress), in this browser's time zone

import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '@/utils/api';

export interface DayCount { day: string; answered: number; correct: number }

export interface Progress {
    today: string;
    goal: number | null;
    todayCount: number;
    streak: number;
    goalStreak: number;
    days: DayCount[];
}

export function useProgress() {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(() => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return api<Progress>(`/api/progress${qs({ tz })}`).then(setProgress, e => setError(e.message));
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const setGoal = useCallback(async (goal: number | null) => {
        await api('/api/progress', { method: 'PUT', body: { goal } });
        await reload();
    }, [reload]);

    return { progress, error, reload, setGoal };
}
