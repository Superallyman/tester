"use client"

// The signed-in user's notes and bookmarks for a set of questions, loaded in one request

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/utils/api';

export interface QuestionNote { note: string; bookmarked: boolean }

export function useNotes(questionIds: string[]) {
    const [notes, setNotes] = useState<Record<string, QuestionNote>>({});
    const key = questionIds.join(',');

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        api<({ question_id: string } & QuestionNote)[]>('/api/notes', { body: { ids: key.split(',') } })
            .then(rows => { if (!cancelled) setNotes(Object.fromEntries(rows.map(({ question_id, ...n }) => [question_id, n]))); })
            .catch(console.error);
        return () => { cancelled = true; };
    }, [key]);

    /** Shows the change at once, then saves it */
    const save = useCallback(async (questionId: string, patch: Partial<QuestionNote>) => {
        const blank: QuestionNote = { note: '', bookmarked: false };
        setNotes(prev => ({ ...prev, [questionId]: { ...blank, ...prev[questionId], ...patch } }));
        // Notes are small, so keepalive is cheap; it lets a save sent as the page closes still arrive
        await api(`/api/notes/${questionId}`, { method: 'PUT', body: patch, keepalive: true });
    }, []);

    return { notes, save };
}
