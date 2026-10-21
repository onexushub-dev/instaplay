export type DeviceState = 'setup' | 'offline' | 'connected';

export type RemoteDeviceView = {
  state: DeviceState;
  /** Same vocabulary as the phone remote: Toque para conectar → Pareado → Conectado. */
  statusText: string;
  showSteps: boolean;
  /** Listening for a press: the pulse and "Aperte um botão do controle…". */
  showWaiting: boolean;
  showNote: boolean;
};

type Input = {
  /** A press was heard in this launch of the app. */
  pressed: boolean;
  /** A press was heard in an earlier launch (the app cannot see the iOS pairing, only presses). */
  testedBefore: boolean;
  /** The sheet has been listening for a while without hearing anything. */
  waitedLong: boolean;
};

/** What the Bluetooth remote looks like to the player: the tile on the setup screen and the Dispositivos sheet read this. */
export function remoteDeviceView({ pressed, testedBefore, waitedLong }: Input): RemoteDeviceView {
  if (pressed) {
    return { state: 'connected', statusText: 'Conectado', showSteps: false, showWaiting: false, showNote: false };
  }
  if (testedBefore) {
    return {
      state: 'offline',
      statusText: 'Pareado · aperte um botão',
      showSteps: false,
      showWaiting: true,
      showNote: true,
    };
  }
  return { state: 'setup', statusText: 'Toque para conectar', showSteps: true, showWaiting: true, showNote: waitedLong };
}
