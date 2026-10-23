import { render, screen } from '@testing-library/react-native';

import { ConnectionBar } from '../ConnectionBar';

test('says the state in words for screen readers, not only in colour', async () => {
  await render(<ConnectionBar tone="ok" name="Quadra 1" detail="12:34 · 3 lances" />);
  expect(screen.getByText('Quadra 1')).toBeTruthy();
  expect(screen.getByText('12:34 · 3 lances')).toBeTruthy();
  expect(screen.getByLabelText('Conectado a Quadra 1')).toBeTruthy();
});

test('amber is reconnecting and red is blocked', async () => {
  const view = await render(<ConnectionBar tone="warn" name="Quadra 1" />);
  expect(screen.getByLabelText('Reconectando a Quadra 1')).toBeTruthy();
  await view.rerender(<ConnectionBar tone="bad" name="Quadra 1" />);
  expect(screen.getByLabelText('Sem Bluetooth')).toBeTruthy();
});
