import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';

test('renders the label and calls onPress', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar jogo" onPress={onPress} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Começar jogo' }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test('disabled button does not call onPress and reports disabled', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar jogo" onPress={onPress} disabled />);

  const button = screen.getByRole('button', { name: 'Começar jogo' });
  await fireEvent.press(button);

  expect(onPress).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
});
