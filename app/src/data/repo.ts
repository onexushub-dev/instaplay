import { type Clip, DEFAULT_PREFS, DEFAULT_TRIM_MS, MAX_CLIP_NAME, MAX_GAME_NAME, type Prefs, type Session, type Sport } from './schema';

export interface KV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  /** All stored keys; used once to rebuild the game index for data saved before it existed. */
  keys?(): string[];
}

export interface FileProbe {
  exists(path: string): boolean;
  sizeBytes(path: string): number;
}

const key = {
  prefs: 'lance:v1:prefs',
  session: (id: string) => `lance:v1:session:${id}`,
  clip: (id: string) => `lance:v1:clip:${id}`,
  clipsOf: (sessionId: string) => `lance:v1:clips-of:${sessionId}`,
  sessions: 'lance:v1:sessions',
};
const SESSION_PREFIX = 'lance:v1:session:';

/** Sessions and clips stored on the phone, one JSON value per record. IDs are UUIDs, ready for a future account. */
export function createRepo(kv: KV, files: FileProbe, newId: () => string) {
  const read = <T>(k: string): T | undefined => {
    const raw = kv.getString(k);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  };
  const write = (k: string, value: unknown) => kv.set(k, JSON.stringify(value));
  const clipIds = (sessionId: string) => read<string[]>(key.clipsOf(sessionId)) ?? [];

  // Screens re-read sessions/clips when this changes (useSyncExternalStore).
  const listeners = new Set<() => void>();
  let version = 0;
  const changed = () => {
    version += 1;
    listeners.forEach((fn) => fn());
  };

  function getSession(id: string): Session | undefined {
    return read<Session>(key.session(id));
  }

  function sessionIds(): string[] {
    const ids = read<string[]>(key.sessions);
    if (ids) return ids;
    const found = (kv.keys?.() ?? []).filter((k) => k.startsWith(SESSION_PREFIX)).map((k) => k.slice(SESSION_PREFIX.length));
    write(key.sessions, found);
    return found;
  }

  return {
    getPrefs(): Prefs {
      return { ...DEFAULT_PREFS, ...read<Partial<Prefs>>(key.prefs) };
    },

    setPrefs(patch: Partial<Prefs>): Prefs {
      const next = { ...this.getPrefs(), ...patch };
      write(key.prefs, next);
      return next;
    },

    getSession,

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },

    version(): number {
      return version;
    },

    startSession(sport: Sport, now: number): Session {
      const ids = sessionIds(); // before writing, so a first-time rebuild doesn't list this game twice
      const session: Session = { id: newId(), sport, startedAt: now };
      write(key.session(session.id), session);
      write(key.sessions, [...ids, session.id]);
      changed();
      return session;
    },

    endSession(id: string, now: number): Session {
      const session = { ...getSession(id)!, endedAt: now };
      write(key.session(id), session);
      changed();
      return session;
    },

    /** Trims and cuts the name to MAX_GAME_NAME; a blank name removes it. */
    renameSession(id: string, name: string): Session {
      const trimmed = name.trim().slice(0, MAX_GAME_NAME);
      const { name: _old, ...rest } = getSession(id)!;
      const session: Session = trimmed ? { ...rest, name: trimmed } : rest;
      write(key.session(id), session);
      changed();
      return session;
    },

    /** Trims and cuts the name to MAX_CLIP_NAME; a blank name removes it. Undefined if the clip is gone. */
    renameClip(id: string, name: string): Clip | undefined {
      const existing = read<Clip>(key.clip(id));
      if (!existing) return undefined;
      const trimmed = name.trim().slice(0, MAX_CLIP_NAME);
      const { name: _old, ...rest } = existing;
      const clip: Clip = trimmed ? { ...rest, name: trimmed } : rest;
      write(key.clip(id), clip);
      changed();
      return clip;
    },

    /** Games with at least one existing clip, newest first. */
    listSessions(): { session: Session; clips: number; firstClip?: Clip }[] {
      return sessionIds()
        .map((id) => getSession(id))
        .filter((s): s is Session => s !== undefined)
        .map((session) => {
          const clips = this.listClips(session.id);
          return { session, clips: clips.length, firstClip: clips[0] };
        })
        .filter((g) => g.clips > 0)
        .sort((a, b) => b.session.startedAt - a.session.startedAt);
    },

    updateClip(id: string, patch: { trim?: Clip['trim']; edit?: Clip['edit']; contentStartMs?: number; savedAt?: number; sharedAt?: number }): Clip | undefined {
      const existing = read<Clip>(key.clip(id));
      if (!existing) return undefined; // deleted meanwhile: never resurrect a record without a file
      const clip = { ...existing, ...patch };
      write(key.clip(id), clip);
      changed();
      return clip;
    },

    /** `cutMs`: the default cut, the last N ms up to the trigger (the mode's cutSeconds). */
    addClip(input: Omit<Clip, 'id' | 'trim'>, cutMs: number = DEFAULT_TRIM_MS): Clip {
      const clip: Clip = {
        ...input,
        id: newId(),
        trim: { startMs: Math.max(0, input.durationMs - cutMs), endMs: input.durationMs },
      };
      write(key.clip(clip.id), clip);
      write(key.clipsOf(clip.sessionId), [...clipIds(clip.sessionId), clip.id]);
      changed();
      return clip;
    },

    getClip(id: string): Clip | undefined {
      return read<Clip>(key.clip(id));
    },

    deleteClip(id: string): void {
      const clip = read<Clip>(key.clip(id));
      if (!clip) return;
      kv.delete(key.clip(id));
      write(key.clipsOf(clip.sessionId), clipIds(clip.sessionId).filter((c) => c !== id));
      changed();
    },

    /**
     * Removes a game and all its clips from the records. Returns the files of those clips, for the caller to delete
     * (the repo knows nothing about the file system beyond probing).
     */
    deleteSession(id: string): string[] {
      const paths: string[] = [];
      for (const clipId of clipIds(id)) {
        const clip = read<Clip>(key.clip(clipId));
        if (clip) paths.push(clip.path);
        kv.delete(key.clip(clipId));
      }
      kv.delete(key.clipsOf(id));
      kv.delete(key.session(id));
      write(key.sessions, sessionIds().filter((s) => s !== id));
      changed();
      return paths;
    },

    /** Oldest first; clips whose file is gone (OS cleanup, undo race) are left out. */
    listClips(sessionId: string): Clip[] {
      return clipIds(sessionId)
        .map((id) => read<Clip>(key.clip(id)))
        .filter((c): c is Clip => c !== undefined && files.exists(c.path))
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    sessionStats(sessionId: string): { clips: number; bytes: number; recordedMs: number } {
      const clips = this.listClips(sessionId);
      const session = getSession(sessionId);
      return {
        clips: clips.length,
        bytes: clips.reduce((sum, c) => sum + files.sizeBytes(c.path), 0),
        recordedMs: session?.endedAt ? session.endedAt - session.startedAt : 0,
      };
    },
  };
}

export type Repo = ReturnType<typeof createRepo>;
