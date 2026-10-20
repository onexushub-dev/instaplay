import type { TriggerSource } from '../data/schema';

export const SOURCE_LABEL: Record<TriggerSource, string> = {
  screen: 'Tela',
  gesture: 'Acenar com os braços',
  remote: 'Controle',
  watch: 'Relógio',
  voice: 'Voz',
};
