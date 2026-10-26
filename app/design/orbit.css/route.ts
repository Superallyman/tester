// Serves the Orbit kit's stylesheet as-is, so it can be copied or downloaded from the showcase
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
    const css = await readFile(path.join(process.cwd(), 'app', 'design', 'orbit', 'orbit.css'), 'utf8');
    return new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' } });
}
