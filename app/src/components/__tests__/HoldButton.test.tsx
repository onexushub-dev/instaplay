import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { HoldButton } from '../HoldButton';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('holding for the full duration completes', async () => {
  const onComplete = jest.fn();
  await render(<HoldButton label="Segure para encerrar o jogo" holdingLabel="Continue segurando…" onComplete={onComplete} />);

  await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar o jogo' }), 'pressIn');
  expect(screen.getByText('Continue segurando…')).toBeTruthy();
  await act(async () => jest.advanceTimersByTime(1000));

  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('letting go early cancels', async () => {
  const onComplete = jest.fn();
  await render(<HoldButton label="Segure para encerrar o jogo" holdingLabel="Continue segurando…" onComplete={onComplete} />);
  const button = screen.getByRole('button', { name: 'Segure para encerrar o jogo' });

  await fireEvent(button, 'pressIn');
  await act(async () => jest.advanceTimersByTime(600));
  await fireEvent(button, 'pressOut');
  await act(async () => jest.advanceTimersByTime(1000));

  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.getByText('Segure para encerrar o jogo')).toBeTruthy();
});

test('screen readers can trigger it with an action', async () => {
  const onComplete = jest.fn();
  await render(<HoldButton label="Segure para encerrar o jogo" holdingLabel="Continue segurando…" onComplete={onComplete} />);
  await fireEvent(screen.getByRole('button', { name: 'Segure para encerrar o jogo' }), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
  expect(onComplete).toHaveBeenCalled();
});
