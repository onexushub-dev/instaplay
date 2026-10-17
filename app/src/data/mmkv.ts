import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { createMMKV } from 'react-native-mmkv';

import { createRepo, type FileProbe, type KV } from './repo';

const storage = createMMKV({ id: 'lance' });

export const kv: KV = {
  getString: (k) => storage.getString(k),
  set: (k, v) => storage.set(k, v),
  delete: (k) => void storage.remove(k),
};

/** Clip paths are absolute filesystem paths from the native module. */
export const files: FileProbe = {
  exists: (path) => new File(`file://${path}`).exists,
  sizeBytes: (path) => new File(`file://${path}`).size ?? 0,
};

export const repo = createRepo(kv, files, randomUUID);

/** Deletes a saved clip's file; a file that is already gone is the goal. */
export function removeFile(path: string): void {
  try {
    new File(`file://${path}`).delete();
  } catch {
    // already gone
  }
}
