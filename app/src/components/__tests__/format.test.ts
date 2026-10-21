import { dayAndTime, megabytes, modeLabel, modeTip, recordedLabel, seconds, sessionLabel, timeOfDay } from '../format';

// Recent ICU writes "6:40 PM" with a narrow no-break space; compare with plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ');

const at = new Date(2026, 9, 17, 18, 40).getTime();
const later = new Date(2026, 9, 20).getTime();

test('sessionLabel uses the name, else mode and date', () => {
  expect(sessionLabel({ id: 's', sport: 'futevolei', startedAt: at, name: 'Final' })).toBe('Final');
  expect(sessionLabel({ id: 's', sport: 'futevolei', startedAt: at }, later)).toBe('Futevôlei · 17/10, 18:40');
  expect(plain(sessionLabel({ id: 's', sport: 'futevolei', startedAt: at }, later, 'en'))).toBe(
    'Footvolley · 10/17, 6:40 PM',
  );
});

test('dayAndTime says today, else the day, in each language', () => {
  expect(dayAndTime(at, at)).toBe('hoje, 18:40');
  expect(dayAndTime(at, later)).toBe('17/10, 18:40');
  expect(plain(dayAndTime(at, at, 'en'))).toBe('today, 6:40 PM');
  expect(plain(dayAndTime(new Date(2026, 9, 16, 18, 40).getTime(), at, 'en'))).toBe('10/16, 6:40 PM');
});

test('timeOfDay keeps two-digit hours in Portuguese and AM/PM in English', () => {
  const morning = new Date(2026, 9, 17, 8, 5).getTime();
  expect(timeOfDay(morning)).toBe('08:05');
  expect(plain(timeOfDay(morning, 'en'))).toBe('8:05 AM');
});

test('recordedLabel in hours and minutes', () => {
  const twoFourteen = (2 * 60 + 14) * 60_000;
  expect(recordedLabel(twoFourteen)).toBe('2h14');
  expect(recordedLabel(14 * 60_000)).toBe('14min');
  expect(recordedLabel(twoFourteen, 'en')).toBe('2h 14m');
  expect(recordedLabel(14 * 60_000, 'en')).toBe('14 min');
  expect(recordedLabel((60 + 5) * 60_000)).toBe('1h05');
});

test('megabytes group thousands the local way', () => {
  expect(megabytes(1_234_000_000)).toBe('1.234 MB');
  expect(megabytes(1_234_000_000, 'en')).toBe('1,234 MB');
  expect(megabytes(90_400_000, 'en')).toBe('90 MB');
});

test('seconds is m:ss in every language', () => {
  expect(seconds(65_000)).toBe('1:05');
});

test('mode names and tips are translated', () => {
  expect(modeLabel('quadra')).toBe('Gravação');
  expect(modeLabel('quadra', 'en')).toBe('Recording');
  expect(modeLabel('academia', 'en')).toBe('Gym');
  expect(modeTip('quadra')).toBe('Atrás da linha de fundo, na altura do ombro');
  expect(modeTip('academia', 'en')).toContain('tripod');
});
