import { remoteDeviceView } from '../remoteDevice';

const base = { pressed: false, testedBefore: false, waitedLong: false };

test('never used: asks to connect, shows the steps and the waiting state', () => {
  expect(remoteDeviceView(base)).toEqual({
    state: 'setup',
    statusText: 'Toque para conectar',
    showSteps: true,
    showWaiting: true,
    showNote: false,
  });
});

test('used in a previous launch: "Pareado", no steps, the note explains what to do', () => {
  expect(remoteDeviceView({ ...base, testedBefore: true })).toEqual({
    state: 'offline',
    statusText: 'Pareado · aperte um botão',
    showSteps: false,
    showWaiting: true,
    showNote: true,
  });
});

test('a press this launch: connected, nothing left to do', () => {
  expect(remoteDeviceView({ ...base, pressed: true, testedBefore: true })).toEqual({
    state: 'connected',
    statusText: 'Conectado',
    showSteps: false,
    showWaiting: false,
    showNote: false,
  });
});

test('waiting for a while without a press adds the troubleshooting note and keeps the steps', () => {
  const view = remoteDeviceView({ ...base, waitedLong: true });
  expect(view.showSteps).toBe(true);
  expect(view.showNote).toBe(true);
  expect(view.state).toBe('setup');
});

test('a press hides the note even after a long wait', () => {
  expect(remoteDeviceView({ ...base, pressed: true, waitedLong: true }).showNote).toBe(false);
});
