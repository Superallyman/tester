"use client";

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/utils/api';

// The account's "simple reveal" preference, loaded once and saved when changed (optimistically)
export function useSimpleReveal() {
    const [simpleReveal, setSimpleReveal] = useState(false);
    useEffect(() => {
        api<{ simpleReveal: boolean }>('/api/account/preferences').then(p => setSimpleReveal(p.simpleReveal)).catch(() => {});
    }, []);
    const change = useCallback((on: boolean) => {
        setSimpleReveal(on);
        api('/api/account/preferences', { method: 'PUT', body: { simpleReveal: on } }).catch(() => setSimpleReveal(!on));
    }, []);
    return [simpleReveal, change] as const;
}
