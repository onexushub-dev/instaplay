import type { TriggerSource } from '../data/schema';

export const SOURCE_LABEL: Record<TriggerSource, string> = {
  screen: 'Tela',
  gesture: 'Braços para cima',
  remote: 'Controle',
  watch: 'Relógio',
};
