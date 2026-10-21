import { useEffect, useState } from 'react';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addReplayListener, remoteControllerPreview } from '../../modules/replay-camera';
import { colors, fonts } from '../theme/tokens';
import { Button } from './Button';
import { PulseRing } from './PulseRing';

/** The camera phone only keeps sending pictures for a few seconds after the last ask, so the ask is repeated. */
const ASK_EVERY_MS = 1000;
/** No picture for this long: say so instead of showing a frozen or empty view. */
const STALE_AFTER_MS = 4000;

type Props = { visible: boolean; onClose: () => void };

/** What the camera phone sees, as a full-screen view over the remote, to check the framing from far away. */
export function RemotePreview({ visible, onClose }: Props) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
      visible={visible}>
      {visible ? <PreviewBody onClose={onClose} /> : null}
    </Modal>
  );
}

// Mounted only while open, so every opening starts without the last picture of the previous one.
function PreviewBody({ onClose }: { onClose: () => void }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    remoteControllerPreview(true);
    const ask = setInterval(() => remoteControllerPreview(true), ASK_EVERY_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const sub = addReplayListener('onRemoteFrame', (e) => {
      setFrame(e.jpeg);
      setLastAt(Date.now());
      setNow(Date.now());
    });
    return () => {
      clearInterval(ask);
      clearInterval(clock);
      sub.remove();
      remoteControllerPreview(false);
    };
  }, []);

  const stale = lastAt !== null && now - lastAt > STALE_AFTER_MS;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.picture}>
        {frame !== null ? (
          <Image
            accessibilityLabel="O que a câmera está vendo"
            resizeMode="contain"
            source={{ uri: `data:image/jpeg;base64,${frame}` }}
            style={[StyleSheet.absoluteFill, stale && styles.stale]}
          />
        ) : null}
        {frame === null || stale ? (
          <View style={styles.center}>
            <PulseRing color={colors.warning} size={64} />
            <Text style={styles.status}>
              {frame === null ? 'Abrindo a imagem da câmera…' : 'Imagem parada. Reconectando…'}
            </Text>
            {frame === null ? (
              <Text style={styles.hint}>O LANCE precisa estar aberto e com a câmera ligada no outro celular.</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.bottom}>
        <Button label="Voltar" onPress={onClose} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  picture: { flex: 1, backgroundColor: '#000' },
  stale: { opacity: 0.35 },
  center: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  status: {
    fontFamily: fonts.bodySemi,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  bottom: { padding: 16 },
});
