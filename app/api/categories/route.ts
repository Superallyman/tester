import { handler } from '@/server/auth';
import { query } from '@/server/db';

// Question count per raw category name (same shape the old get_category_counts RPC returned)
export const GET = handler(() =>
    query<{ cat_name: string; q_count: number }>('select cat_name, q_count::int as q_count from get_category_counts()'));
