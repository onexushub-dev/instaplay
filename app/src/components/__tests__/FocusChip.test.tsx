import { fireEvent, render, screen } from '@testing-library/react-native';

import { FocusChip } from '../FocusChip';

test('on: a checked switch named Modo Foco that turns it off', async () => {
  const onToggle = jest.fn();
  await render(<FocusChip state="on" onToggle={onToggle} />);
  const chip = screen.getByRole('switch', { name: 'Modo Foco' });
  expect(chip.props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByText('Modo Foco')).toBeTruthy();
  await fireEvent.press(chip);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('off: an unchecked switch', async () => {
  await render(<FocusChip state="off" onToggle={() => {}} />);
  expect(screen.getByRole('switch', { name: 'Modo Foco' }).props.accessibilityState).toMatchObject({ checked: false });
});

test('preparing: says so and cannot be pressed yet', async () => {
  const onToggle = jest.fn();
  await render(<FocusChip state="preparing" onToggle={onToggle} />);
  expect(screen.getByText('Modo Foco · preparando')).toBeTruthy();
  const chip = screen.getByRole('switch', { name: 'Modo Foco' });
  expect(chip.props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(chip);
  expect(onToggle).not.toHaveBeenCalled();
});
