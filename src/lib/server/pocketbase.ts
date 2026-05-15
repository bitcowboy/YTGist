import PocketBase from 'pocketbase';
import { POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } from '$env/static/private';

export const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

let adminAuthPromise: Promise<void> | null = null;

export const ensureAdminAuth = async (): Promise<void> => {
    if (pb.authStore.isValid) return;
    if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
        throw new Error('PocketBase admin credentials are not configured');
    }
    if (!adminAuthPromise) {
        adminAuthPromise = pb
            .collection('_superusers')
            .authWithPassword(POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD)
            .then(() => undefined)
            .catch((err) => {
                adminAuthPromise = null;
                throw err;
            });
    }
    await adminAuthPromise;
};

export const escapeFilterValue = (value: string): string => value.replace(/"/g, '\\"');
