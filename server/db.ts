// Postgres connection pool for API routes. Only server code may import this.

import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
    throw new Error('Missing env.DATABASE_URL');
}

// Reuse one pool across dev hot reloads instead of leaking a new one per edit
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool = globalForPg.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool;

// An idle connection dropped by a database restart emits 'error'; without a listener that would crash the server
if (!globalForPg.pgPool?.listenerCount('error')) pool.on('error', err => console.error('Postgres pool error:', err.message));

export const query = async <T>(text: string, params: unknown[] = []) => (await pool.query(text, params)).rows as T[];
