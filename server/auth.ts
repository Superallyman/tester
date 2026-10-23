// Session checks for API routes: every route needs a signed-in user with an enabled account

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { accountById } from './authOptions';

export interface ApiUser {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
    canSeeLeaderboard: boolean;
}

export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

// Reads the account on every call, so disabling someone takes effect without waiting for their session to expire
export async function requireUser(req: NextRequest): Promise<ApiUser> {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.uid) throw new HttpError(401, 'Not signed in');
    const account = await accountById(token.uid);
    if (!account || account.disabled) throw new HttpError(403, 'Not allowed');
    return { id: account.id, email: account.email, name: account.name, isAdmin: account.is_admin, canSeeLeaderboard: account.can_see_leaderboard };
}

/** Wraps a route handler so auth failures and bad input become JSON errors instead of 500 pages. */
export function handler<C>(fn: (req: NextRequest, user: ApiUser, ctx: C) => Promise<unknown>, opts?: { admin?: boolean }) {
    return async (req: NextRequest, ctx: C) => {
        try {
            const user = await requireUser(req);
            if (opts?.admin && !user.isAdmin) throw new HttpError(403, 'Admins only');
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
