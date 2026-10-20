import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceNameField } from '../DeviceNameField';

jest.mock('../../../modules/replay-camera', () => ({
  remoteDeviceName: jest.fn(() => 'iPhone XR#1234'),
  remoteSetDeviceName: jest.fn(),
}));

const camera = () => jest.requireMock('../../../modules/replay-camera');

beforeEach(() => jest.clearAllMocks());

test('shows the name this phone has now', async () => {
  await render(<DeviceNameField />);
  expect(screen.getByLabelText('Nome deste celular').props.value).toBe('iPhone XR#1234');
});

test('saves the new name when editing ends', async () => {
  await render(<DeviceNameField />);
  const input = screen.getByLabelText('Nome deste celular');
  await fireEvent.changeText(input, 'Controle da quadra');
  await fireEvent(input, 'endEditing');
  expect(camera().remoteSetDeviceName).toHaveBeenCalledWith('Controle da quadra');
});

test('an empty name goes back to the default one', async () => {
  await render(<DeviceNameField />);
  const input = screen.getByLabelText('Nome deste celular');
  await fireEvent.changeText(input, '');
  await fireEvent(input, 'submitEditing');
  expect(camera().remoteSetDeviceName).toHaveBeenCalledWith('');
  expect(screen.getByLabelText('Nome deste celular').props.value).toBe('iPhone XR#1234');
});

test('says that the name appears on the other phone and when it takes effect', async () => {
  await render(<DeviceNameField />);
  expect(screen.getByText('Aparece no outro celular. Vale a partir do próximo pareamento.')).toBeTruthy();
});
