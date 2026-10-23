// Access is decided by the app_users table (see postgres/init/002_app_users.sql and /admin/users).
// These GitHub logins, from the old display-name allowlist, get an account the first time they sign in.
// Unlike display names, a login is unique and can't be claimed by someone else. Remove once they have all signed in.
export const LEGACY_GITHUB_LOGINS = ["superallyman", "amer1001", "bryanjennell-byte"];
