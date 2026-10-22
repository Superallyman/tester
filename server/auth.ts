// Session checks for API routes: every route needs a signed-in, allowlisted user

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { ALLOWED_USERS } from '@/utils/allowlist';

export interface ApiUser {
    email: string;
    name: string;
}

export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export async function requireUser(req: NextRequest): Promise<ApiUser> {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const name = (token?.name || token?.login) as string | undefined;
    if (!token || !name) throw new HttpError(401, 'Not signed in');
    if (!ALLOWED_USERS.includes(name)) throw new HttpError(403, 'Not allowed');
    if (!token.email) throw new HttpError(403, 'Account has no email');
    return { email: token.email, name };
}

/** Wraps a route handler so auth failures and bad input become JSON errors instead of 500 pages. */
export function handler<C>(fn: (req: NextRequest, user: ApiUser, ctx: C) => Promise<unknown>) {
    return async (req: NextRequest, ctx: C) => {
        try {
            const user = await requireUser(req);
            return NextResponse.json(await fn(req, user, ctx));
        } catch (err) {
            if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
            console.error(err);
            return NextResponse.json({ error: 'Server error' }, { status: 500 });
        }
    };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export const ratingOrNull = (v: unknown, max: number) => {
    if (v === null || v === undefined) return null;
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > max) throw new HttpError(400, 'Bad rating');
    return v as number;
};
