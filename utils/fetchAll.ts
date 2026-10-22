// Supabase/PostgREST caps every response at 1000 rows, so a plain .select() silently
// truncates large tables. This pages through with .range() until a short page comes back.

const PAGE = 1000;

interface RangeQuery<T> {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
}

export async function fetchAll<T>(makeQuery: () => RangeQuery<T>): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await makeQuery().range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) return rows;
    }
}

// .in('id', [...]) with hundreds of UUIDs can exceed URL length limits; split into batches.
export async function fetchByIds<T>(ids: string[], makeQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>, chunkSize = 80): Promise<T[]> {
    const rows: T[] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
        const { data, error } = await makeQuery(ids.slice(i, i + chunkSize));
        if (error) throw error;
        rows.push(...(data || []));
    }
    return rows;
}
