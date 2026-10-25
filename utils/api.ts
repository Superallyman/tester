// Browser-side helper for the app's own /api routes

// keepalive lets a small request finish while the page is closing
export async function api<T>(path: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<T> {
    const res = await fetch(path, {
        keepalive: init?.keepalive,
        method: init?.method || (init?.body !== undefined ? 'POST' : 'GET'),
        headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
    return data as T;
}

/** Builds "?a=1&b=x&b=y" from an object, repeating keys for arrays and skipping empty values. */
export function qs(params: Record<string, string | number | string[] | undefined | null>) {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        (Array.isArray(v) ? v : [v]).forEach(x => sp.append(k, String(x)));
    });
    const s = sp.toString();
    return s ? `?${s}` : '';
}
