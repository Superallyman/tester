// NextAuth configuration: GitHub or email + password, both resolving to one row in app_users.
// Server only (it queries Postgres); the route handler and getServerSession import it.

import type { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from './db';
import { hashPassword, verifyPassword } from './passwords';
import { clearFailures, isLimited, recordFailure } from './rateLimit';
import { LEGACY_GITHUB_LOGINS } from '../utils/allowlist';

export interface Account {
    id: string;
    email: string;
    name: string;
    password_hash: string | null;
    github_login: string | null;
    is_admin: boolean;
    disabled: boolean;
    must_change_password: boolean;
}

const COLUMNS = 'id, email, name, password_hash, github_login, is_admin, disabled, must_change_password';

const accountWhere = async (where: string, value: string) =>
    (await query<Account>(`select ${COLUMNS} from app_users where ${where} = $1`, [value]))[0] as Account | undefined;

export const accountById = (id: string) => accountWhere('id', id);

const touchLogin = (id: string) => query('update app_users set last_login_at = now() where id = $1', [id]);

/** The account for a GitHub sign-in: linked by login, else claimed by verified email, else created for a legacy login. */
async function githubAccount(login: string, email: string | null | undefined, name: string) {
    const linked = await accountWhere('github_login', login);
    if (linked) return linked;
    if (!email) return undefined;
    email = email.trim().toLowerCase();
    // An account invited by email links to the first GitHub login that signs in with it, and takes its name
    const [claimed] = await query<Account>(
        `update app_users set github_login = $1, name = $3 where email = $2 and github_login is null returning ${COLUMNS}`,
        [login, email, name]);
    if (claimed || !LEGACY_GITHUB_LOGINS.includes(login)) return claimed;
    const [created] = await query<Account>(
        `insert into app_users (email, name, github_login) values ($1, $2, $3) on conflict do nothing returning ${COLUMNS}`,
        [email, name, login]);
    return created;
}

// Compared against when the email is unknown, so a miss takes as long as a wrong password
let dummyHash: Promise<string> | undefined;

export const authOptions: NextAuthOptions = {
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID ?? "",
            clientSecret: process.env.GITHUB_SECRET ?? "",
            issuer: "https://github.com/login/oauth",
        }),
        CredentialsProvider({
            id: 'credentials',
            name: 'Email',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                const email = credentials?.email?.trim().toLowerCase() ?? '';
                const password = credentials?.password ?? '';
                if (!email || !password) return null;
                const key = `email:${email}`;
                if (isLimited(key)) throw new Error('Too many attempts. Try again in 15 minutes.');

                const account = await accountWhere('email', email);
                const ok = await verifyPassword(password, account?.password_hash ?? await (dummyHash ??= hashPassword('dummy')));
                if (!account || !ok || account.disabled) {
                    recordFailure(key);
                    return null;
                }
                clearFailures(key);
                await touchLogin(account.id);
                return { id: account.id, email: account.email, name: account.name };
            },
        }),
    ],
    pages: { signIn: '/signin', error: '/signin' },
    callbacks: {
        // Password sign-ins were checked in authorize; a GitHub sign-in needs an enabled account
        async signIn({ user, account, profile }) {
            if (account?.provider !== 'github') return true;
            const login = String((profile as { login?: string } | undefined)?.login ?? '').toLowerCase();
            if (!login) return false;
            const row = await githubAccount(login, user.email, user.name || login);
            if (!row || row.disabled) return false;
            await touchLogin(row.id);
            return true;
        },
        // Stamp the account into the token at sign-in, and re-read it when the client calls update()
        async jwt({ token, user, account, profile, trigger }) {
            let row: Account | undefined;
            if (account?.provider === 'github') {
                row = await accountWhere('github_login', String((profile as { login?: string }).login).toLowerCase());
            } else if (account?.provider === 'credentials') {
                row = await accountById(user.id);
            } else if (trigger === 'update' && token.uid) {
                row = await accountById(token.uid);
            }
            if (account) token.method = account.provider === 'github' ? 'github' : 'password';
            if (row) {
                Object.assign(token, {
                    uid: row.id, email: row.email, name: row.name, isAdmin: row.is_admin,
                    // A temporary password only has to be replaced by someone who signed in with it
                    mustChangePassword: row.must_change_password && token.method === 'password',
                });
            }
            return token;
        },
        async session({ session, token }) {
            session.user = {
                ...session.user,
                uid: token.uid, isAdmin: token.isAdmin, mustChangePassword: token.mustChangePassword,
            };
            return session;
        },
    },
};
