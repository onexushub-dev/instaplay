import { MODE_LABEL as SPORT_LABEL } from '../components/format';

import type { Sport, TemplateId } from '../data/schema';
import { MODES } from '../modes/registry';

export type { TemplateId };

export const TEMPLATE_LABEL: Record<TemplateId, string> = {
  placar: 'Placar',
  minimal: 'Minimal',
  arena: 'Arena',
  treino: 'Treino',
  recorde: 'Recorde',
};

export const TEMPLATES: { id: TemplateId; label: string }[] = (['placar', 'minimal', 'arena'] as const).map((id) => ({
  id,
  label: TEMPLATE_LABEL[id],
}));

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const pad = (n: number) => String(n).padStart(2, '0');

type Input = { sport: Sport; startedAt: number; arena?: string; gameName?: string };

/** The lines drawn in the top and bottom bands of a Story. */
export function storyTexts(
  template: TemplateId,
  { sport, startedAt, arena, gameName }: Input,
): { top: string[]; bottom: string[] } {
  const d = new Date(startedAt);
  // Quadra and Academia games print no mode name ("QUADRA" says nothing); games saved with a sport keep it.
  const sportCaps = MODES.some((m) => m.id === sport) ? undefined : SPORT_LABEL[sport].toLocaleUpperCase('pt-BR');
  const withSport = (...lines: string[]) => (sportCaps ? [sportCaps, ...lines] : lines);
  const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  switch (template) {
    case 'placar':
      return {
        top: withSport(`${dayMonth} · ${pad(d.getHours())}:${pad(d.getMinutes())}`),
        bottom: ['QUE LANCE', arena || gameName || ''],
      };
    case 'minimal':
      return { top: [], bottom: [sportCaps ? `${sportCaps} · ${date}` : date] };
    case 'arena':
      return { top: [arena || 'SUA ARENA'], bottom: withSport(dayMonth) };
    case 'treino':
      return { top: withSport(dayMonth), bottom: ['TREINO', arena ?? ''] };
    case 'recorde':
      return { top: withSport(), bottom: ['RECORDE PESSOAL', arena ?? ''] };
  }
}
