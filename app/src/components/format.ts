import type { Sport } from '../data/schema';

export const SPORT_LABEL: Record<Sport, string> = {
  beachTennis: 'Beach tennis',
  futevolei: 'Futevôlei',
  voleiPraia: 'Vôlei de praia',
  outro: 'Outro',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "2h14" from 2h14min; "14min" under an hour. */
export function recordedLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h${pad(minutes % 60)}` : `${minutes}min`;
}

export function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function timeOfDay(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "hoje, 18:40" or "16/10, 18:40". */
export function dayAndTime(at: number, now = Date.now()): string {
  const d = new Date(at);
  const today = new Date(now).toDateString() === d.toDateString();
  return `${today ? 'hoje' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`}, ${timeOfDay(at)}`;
}

export function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
