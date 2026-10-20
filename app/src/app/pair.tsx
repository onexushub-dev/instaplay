import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteControllerPairWithLink,
  remoteControllerStart,
  remoteControllerStop,
} from '../../modules/replay-camera';
import type { RemotePairFailure } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { parsePairLink } from '../remote/pairLink';
import { colors, fonts } from '../theme/tokens';

const REDIRECT_AFTER_MS = 1200;

function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
  return value;
}

function failureText(reason: RemotePairFailure): string {
  switch (reason) {
    case 'expired':
      return 'Código vencido. Peça um novo no celular da câmera.';
    case 'locked':
      return 'Muitas tentativas. Gere um novo código.';
    case 'notFound':
      return 'Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.';
    case 'denied':
      return 'Libere a rede local nos Ajustes para usar o controle.';
    case 'full':
      return 'O celular da câmera já tem 4 controles. Remova um para parear outro.';
    default:
      return 'Código incorreto. Peça um novo no celular da câmera.';
  }
}

/** Where the `lance://pair?...` link (read by the Camera app from the QR code) lands. */
export default function Pair() {
  const params = useLocalSearchParams<{ h?: string; s?: string; n?: string }>();
  const h = one(params.h);
  const s = one(params.s);
  const n = one(params.n);
  const link = parsePairLink({ h, s, n });
  const hostId = link === null ? null : link.hostId;
  const secret = link === null ? null : link.secret;
  const [hostName, setHostName] = useState(link === null ? '' : link.hostName);
  const [paired, setPaired] = useState(false);
  const [failure, setFailure] = useState<RemotePairFailure | null>(null);
  const pairedRef = useRef(false);

  useEffect(() => {
    if (hostId === null || secret === null) return;
    const parsed = parsePairLink({ h, s, n });
    if (parsed === null) return;
    const sub = addReplayListener('onRemotePairing', (e) => {
      if (e.phase === 'paired') {
        pairedRef.current = true;
        setHostName(e.peer.name);
        setFailure(null);
        setPaired(true);
      } else {
        setFailure(e.reason);
      }
    });
    remoteControllerStart();
    remoteControllerPairWithLink(parsed.hostId, parsed.secret, parsed.hostName);
    return () => {
      sub.remove();
      if (!pairedRef.current) remoteControllerStop();
    };
    // The link is read once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, secret]);

  useEffect(() => {
    if (!paired) return;
    const id = setTimeout(() => router.replace('/remote'), REDIRECT_AFTER_MS);
    return () => clearTimeout(id);
  }, [paired]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        {link === null ? (
          <Text style={styles.warning}>Este link de pareamento não é válido. Peça um novo código no celular da câmera.</Text>
        ) : paired ? (
          <Text style={styles.success}>{`Pronto! Este celular agora controla ${hostName}`}</Text>
        ) : failure !== null ? (
          <Text style={styles.warning}>{failureText(failure)}</Text>
        ) : (
          <Text style={styles.status}>{`Conectando a ${hostName}…`}</Text>
        )}
        {paired ? null : <Button label="Fechar" variant="secondary" onPress={() => router.back()} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, padding: 20, gap: 16, justifyContent: 'center' },
  status: { fontFamily: fonts.bodySemi, fontSize: 20, lineHeight: 28, color: colors.text, textAlign: 'center' },
  success: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 28, color: colors.accent, textAlign: 'center' },
  warning: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.warning, textAlign: 'center' },
});
