import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';

test('renders the label and calls onPress', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar gravação" onPress={onPress} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Começar gravação' }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test('disabled button does not call onPress and reports disabled', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar gravação" onPress={onPress} disabled />);

  const button = screen.getByRole('button', { name: 'Começar gravação' });
  await fireEvent.press(button);

  expect(onPress).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
});

test('loading shows the label, blocks presses and reports busy', async () => {
  const onPress = jest.fn();
  await render(<Button label="Conectando…" onPress={onPress} loading />);

  const button = screen.getByRole('button', { name: 'Conectando…' });
  await fireEvent.press(button);

  expect(onPress).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
  expect(button.props.accessibilityState).toMatchObject({ busy: true });
});
