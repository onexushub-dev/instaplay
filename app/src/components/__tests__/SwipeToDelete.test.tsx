import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SwipeToDelete, settlesOpen } from '../SwipeToDelete';

test('a drag settles open once it passed half way, and closed before', () => {
  expect(settlesOpen(-60)).toBe(true);
  expect(settlesOpen(-20)).toBe(false);
  expect(settlesOpen(0)).toBe(false);
});

test('the button behind the row does nothing until the row is open', async () => {
  const onDelete = jest.fn();
  await render(
    <SwipeToDelete onDelete={onDelete}>
      <Text>linha</Text>
    </SwipeToDelete>,
  );
  expect(screen.getByText('linha')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
  expect(onDelete).not.toHaveBeenCalled();
});
