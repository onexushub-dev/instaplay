import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';

test('renders the label and calls onPress', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar a gravar" onPress={onPress} />);

  await fireEvent.press(screen.getByRole('button', { name: 'Começar a gravar' }));

  expect(onPress).toHaveBeenCalledTimes(1);
});

test('disabled button does not call onPress and reports disabled', async () => {
  const onPress = jest.fn();
  await render(<Button label="Começar a gravar" onPress={onPress} disabled />);

  const button = screen.getByRole('button', { name: 'Começar a gravar' });
  await fireEvent.press(button);

  expect(onPress).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
});
