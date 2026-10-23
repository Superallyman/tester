import "next-auth";
import "next-auth/jwt";

// Account fields carried in the session JWT. Middleware reads them on the edge, where the database isn't reachable.
interface AccountClaims {
    uid?: string;
    isAdmin?: boolean;
    canSeeLeaderboard?: boolean;
    mustChangePassword?: boolean;
    method?: 'github' | 'password';
}

declare module "next-auth/jwt" {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the claims into JWT
    interface JWT extends AccountClaims {}
}

declare module "next-auth" {
    interface Session {
        user?: { name?: string | null; email?: string | null; image?: string | null } & AccountClaims;
    }
}
