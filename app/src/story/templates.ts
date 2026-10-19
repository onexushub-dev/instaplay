import { MODE_LABEL as SPORT_LABEL } from '../components/format';

import type { Sport, TemplateId } from '../data/schema';

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
export function storyTexts(template: TemplateId, { sport, startedAt, arena, gameName }: Input): { top: string[]; bottom: string[] } {
  const d = new Date(startedAt);
  const sportCaps = SPORT_LABEL[sport].toLocaleUpperCase('pt-BR');
  const dayMonth = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  switch (template) {
    case 'placar':
      return {
        top: [sportCaps, `${dayMonth} · ${pad(d.getHours())}:${pad(d.getMinutes())}`],
        bottom: ['QUE LANCE', arena || gameName || ''],
      };
    case 'minimal':
      return { top: [], bottom: [`${sportCaps} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`] };
    case 'arena':
      return { top: [arena || 'SUA ARENA'], bottom: [sportCaps, dayMonth] };
    case 'treino':
      return { top: [sportCaps, dayMonth], bottom: ['TREINO', arena ?? ''] };
    case 'recorde':
      return { top: [sportCaps], bottom: ['RECORDE PESSOAL', arena ?? ''] };
  }
}
