// Applies postgres/migrations/*.sql in name order, each once, each in its own transaction, and records them in
// schema_migrations. postgres/init/ only builds the base schema on an empty volume; everything after goes here.
//
//   npm run db:migrate                     apply pending migrations
//   npm run db:migrate -- --status         list applied and pending
//   npm run db:migrate -- --baseline 004   mark migrations up to 004 as applied without running them
//                                          (for a database that already had them applied by hand)

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import pg from 'pg';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'postgres', 'migrations');
// Any constant works; it only has to be the same for every run of this script
const LOCK_ID = 7110731;

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (run through npm run db:migrate, which loads .env.local)');
    process.exit(1);
}

const args = process.argv.slice(2);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
    // Two dev servers starting at once must not apply the same migration twice
    await client.query('select pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
    )`);

    const files = (await readdir(DIR)).filter(f => f.endsWith('.sql')).sort();
    const applied = new Set((await client.query('select name from schema_migrations')).rows.map(r => r.name));
    const pending = files.filter(f => !applied.has(f));

    if (args[0] === '--status') {
        for (const f of files) console.log(`${applied.has(f) ? 'applied' : 'PENDING'}  ${f}`);
    } else if (args[0] === '--baseline') {
        const upTo = args[1];
        if (!upTo) throw new Error('--baseline needs a migration number, e.g. --baseline 004');
        const marked = pending.filter(f => f.split('_')[0] <= upTo);
        for (const f of marked) await client.query('insert into schema_migrations (name) values ($1)', [f]);
        console.log(marked.length ? `Marked as applied: ${marked.join(', ')}` : 'Nothing to mark');
    } else {
        for (const f of pending) {
            const sql = await readFile(path.join(DIR, f), 'utf8');
            await client.query('begin');
            try {
                await client.query(sql);
                await client.query('insert into schema_migrations (name) values ($1)', [f]);
                await client.query('commit');
                console.log(`Applied ${f}`);
            } catch (err) {
                await client.query('rollback');
                throw new Error(`${f} failed, nothing from it was applied: ${err.message}`);
            }
        }
        if (!pending.length) console.log('Database is up to date');
    }
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await client.end();
}
