import { repo } from '../data/mmkv';
import { createPaymentsStore } from './store';
import { createRevenueCatClient } from './revenuecatClient';

const client = createRevenueCatClient();
client.configure(); // idempotent; the store never configures the SDK itself

/** App-wide payments store; `payments.start()` runs once from the root layout. */
export const payments = createPaymentsStore(client, repo);
