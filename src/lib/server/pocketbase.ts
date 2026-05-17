import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

export const pb = new PocketBase(env.POCKETBASE_URL);
pb.autoCancellation(false);

let adminAuthPromise: Promise<void> | null = null;

const performAdminAuth = async (): Promise<void> => {
    if (!env.POCKETBASE_ADMIN_EMAIL || !env.POCKETBASE_ADMIN_PASSWORD) {
        throw new Error('PocketBase admin credentials are not configured');
    }
    // Clear any stale (e.g. expired) token before re-authenticating so we
    // never send the old Authorization header alongside the auth request.
    pb.authStore.clear();
    await pb
        .collection('_superusers')
        .authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD);
};

export const ensureAdminAuth = async (): Promise<void> => {
    // A long LLM stream can outlive the superuser JWT TTL, so check both
    // that the token is still valid AND that it's actually a superuser auth.
    if (pb.authStore.isValid && pb.authStore.isSuperuser) return;
    if (!adminAuthPromise) {
        adminAuthPromise = performAdminAuth().finally(() => {
            // Reset on both success and failure: on success so a future
            // expiry can trigger a fresh re-auth instead of awaiting a
            // resolved promise; on failure so the next caller can retry.
            adminAuthPromise = null;
        });
    }
    await adminAuthPromise;
};

export const escapeFilterValue = (value: string): string => value.replace(/"/g, '\\"');

// PocketBase collections use plain `date` fields named `created`/`updated`
// (not autodate), so the app has to set them explicitly on every write.
export const withCreatedTimestamps = <T extends object>(data: T): T & { created: string; updated: string } => {
    const now = new Date().toISOString();
    return { ...data, created: now, updated: now };
};

export const withUpdatedTimestamp = <T extends object>(data: T): T & { updated: string } => {
    return { ...data, updated: new Date().toISOString() };
};
