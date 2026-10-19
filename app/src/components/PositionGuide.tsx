import type { Guide } from '../modes/registry';
import { CourtGuide } from './CourtGuide';
import { PersonGuide } from './PersonGuide';

/** The positioning drawing a mode asks for over the live camera. */
export function PositionGuide({ guide }: { guide: Guide }) {
  if (guide === 'court') return <CourtGuide />;
  if (guide === 'person') return <PersonGuide />;
  return null;
}
