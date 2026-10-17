import { type Clip, DEFAULT_PREFS, DEFAULT_TRIM_MS, type Prefs, type Session, type Sport } from './schema';

export interface KV {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
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
};

/** Sessions and clips stored on the phone, one JSON value per record. IDs are UUIDs, ready for a future account. */
export function createRepo(kv: KV, files: FileProbe, newId: () => string) {
  const read = <T>(k: string): T | undefined => {
    const raw = kv.getString(k);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  };
  const write = (k: string, value: unknown) => kv.set(k, JSON.stringify(value));
  const clipIds = (sessionId: string) => read<string[]>(key.clipsOf(sessionId)) ?? [];

  function getSession(id: string): Session | undefined {
    return read<Session>(key.session(id));
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

    startSession(sport: Sport, now: number): Session {
      const session: Session = { id: newId(), sport, startedAt: now };
      write(key.session(session.id), session);
      return session;
    },

    endSession(id: string, now: number): Session {
      const session = { ...getSession(id)!, endedAt: now };
      write(key.session(id), session);
      return session;
    },

    addClip(input: Omit<Clip, 'id' | 'trim'>): Clip {
      const clip: Clip = {
        ...input,
        id: newId(),
        trim: { startMs: Math.max(0, input.durationMs - DEFAULT_TRIM_MS), endMs: input.durationMs },
      };
      write(key.clip(clip.id), clip);
      write(key.clipsOf(clip.sessionId), [...clipIds(clip.sessionId), clip.id]);
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
