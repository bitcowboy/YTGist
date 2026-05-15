import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

export const pb = new PocketBase(env.POCKETBASE_URL);
pb.autoCancellation(false);

let adminAuthPromise: Promise<void> | null = null;

export const ensureAdminAuth = async (): Promise<void> => {
    if (pb.authStore.isValid) return;
    if (!env.POCKETBASE_ADMIN_EMAIL || !env.POCKETBASE_ADMIN_PASSWORD) {
        throw new Error('PocketBase admin credentials are not configured');
    }
    if (!adminAuthPromise) {
        adminAuthPromise = pb
            .collection('_superusers')
            .authWithPassword(env.POCKETBASE_ADMIN_EMAIL, env.POCKETBASE_ADMIN_PASSWORD)
            .then(() => undefined)
            .catch((err) => {
                adminAuthPromise = null;
                throw err;
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
