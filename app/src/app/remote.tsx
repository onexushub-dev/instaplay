import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteControllerHost,
  remoteControllerPairWithCode,
  remoteControllerSave,
  remoteControllerStart,
  remoteControllerStop,
} from '../../modules/replay-camera';
import type { RemoteLink, RemotePairFailure, RemotePeer } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { canSave, remoteScreen } from '../remote/remoteScreen';
import { parseCode } from '../remote/pairLink';
import { colors, fonts, radius } from '../theme/tokens';

const KEEP_AWAKE_TAG = 'remote';
const RESULT_SHOWN_MS = 2500;

type Received = { recording: boolean; clipCount: number; startedAt: number | null; receivedAt: number };

const clock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function failureText(reason: RemotePairFailure): string {
  switch (reason) {
    case 'expired':
      return 'Código vencido. Peça um novo no celular da câmera.';
    case 'locked':
      return 'Muitas tentativas. Gere um novo código.';
    case 'notFound':
      return 'Não encontrei o celular da câmera. Chegue mais perto e confira se o LANCE está aberto lá.';
    case 'denied':
      return 'Este controle não está mais pareado';
    case 'full':
      return 'O celular da câmera já tem 4 controles. Remova um para parear outro.';
    default:
      return 'Código incorreto. Confira os números e tente de novo.';
  }
}

/** The second iPhone: shows the camera phone's game and taps Salvar for it. */
export default function Remote() {
  const [host, setHost] = useState<RemotePeer | null>(() => remoteControllerHost());
  const [link, setLink] = useState<RemoteLink>('idle');
  const [peerName, setPeerName] = useState<string | null>(null);
  const [received, setReceived] = useState<Received | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const lastSave = useRef<number | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    remoteControllerStart();
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      remoteControllerStop();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (resultTimer.current !== null) clearTimeout(resultTimer.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const status = addReplayListener('onRemoteStatus', (e) => {
      setLink(e.link);
      if (e.peerName !== undefined) setPeerName(e.peerName);
    });
    const state = addReplayListener('onRemoteState', (e) => {
      const at = Date.now();
      setNow(at);
      setReceived({
        recording: e.recording,
        clipCount: e.clipCount,
        startedAt: e.startedAt === undefined ? null : e.startedAt,
        receivedAt: at,
      });
    });
    const saved = addReplayListener('onRemoteResult', (e) => {
      setResult(e.saved ? 'saved' : 'failed');
      Haptics.notificationAsync(
        e.saved ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
      if (resultTimer.current !== null) clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => setResult(null), RESULT_SHOWN_MS);
    });
    const pairing = addReplayListener('onRemotePairing', (e) => {
      if (e.phase === 'paired') {
        setNotice(null);
        setReceived(null);
        setHost(remoteControllerHost());
        return;
      }
      if (e.reason === 'denied') {
        setHost(null);
        setReceived(null);
      }
      setNotice(failureText(e.reason));
    });
    return () => {
      status.remove();
      state.remove();
      saved.remove();
      pairing.remove();
    };
  }, []);

  const connect = () => {
    const digits = parseCode(code);
    if (digits === null) {
      setNotice('Digite os 6 números do código.');
      return;
    }
    setNotice(null);
    remoteControllerPairWithCode(digits);
  };

  const save = () => {
    const at = Date.now();
    if (!canSave(at, lastSave.current)) return;
    lastSave.current = at;
    remoteControllerSave();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  if (host === null) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.body}>
          <Text style={styles.title}>Controle</Text>
          {notice !== null ? <Text style={styles.warning}>{notice}</Text> : null}
          <Text style={styles.text}>
            {"Para parear: no celular da câmera, toque no tile 'Celular'. Depois, abra o app Câmera deste iPhone e aponte para o código que aparecer lá. Se preferir, digite o código abaixo."}
          </Text>
          <TextInput
            accessibilityLabel="Código de 6 dígitos"
            keyboardType="number-pad"
            maxLength={7}
            onChangeText={setCode}
            placeholder="000000"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={code}
          />
          <Button label="Conectar" onPress={connect} />
          <Button label="Fechar" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const screenModel = remoteScreen({
    link,
    hostName: host.name.length > 0 ? host.name : peerName,
    state:
      received === null
        ? null
        : {
            recording: received.recording,
            clipCount: received.clipCount,
            startedAt: received.startedAt,
            ageSec: Math.max(0, (now - received.receivedAt) / 1000),
          },
  });

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        {notice !== null ? <Text style={styles.warning}>{notice}</Text> : null}

        {screenModel.kind === 'denied' ? (
          <>
            <Text style={styles.text}>Libere a rede local nos Ajustes para usar o controle.</Text>
            <Button label="Abrir Ajustes" onPress={() => Linking.openSettings()} />
          </>
        ) : null}

        {screenModel.kind === 'searching' ? (
          <Text style={styles.status}>{`Procurando ${screenModel.hostName === null ? host.name : screenModel.hostName}…`}</Text>
        ) : null}

        {screenModel.kind === 'waiting' ? (
          <Text style={styles.status}>{`Conectado a ${screenModel.hostName}. Aguardando o jogo começar.`}</Text>
        ) : null}

        {screenModel.kind === 'stale' ? (
          <Text style={styles.status}>{`Sem conexão com ${screenModel.hostName}`}</Text>
        ) : null}

        {screenModel.kind === 'recording' ? (
          <>
            <Text style={styles.clock}>
              {`${screenModel.startedAt === null ? '0:00' : clock((now - screenModel.startedAt) / 1000)} · ${screenModel.clipCount} ${screenModel.clipCount === 1 ? 'lance' : 'lances'}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="SALVAR"
              onPress={save}
              style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]}>
              <Text style={styles.saveText}>SALVAR</Text>
            </Pressable>
            <Text style={styles.result}>{result === 'saved' ? 'Salvo!' : result === 'failed' ? 'Não salvou' : ' '}</Text>
          </>
        ) : null}

        <Button label="Fechar" variant="secondary" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, padding: 20, gap: 16, justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  text: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text },
  status: { fontFamily: fonts.bodySemi, fontSize: 20, lineHeight: 28, color: colors.text, textAlign: 'center' },
  warning: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.warning },
  clock: { fontFamily: fonts.displayBold, fontSize: 36, color: colors.text, textAlign: 'center' },
  input: {
    fontFamily: fonts.displayBold,
    fontSize: 32,
    letterSpacing: 4,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    minHeight: 64,
    textAlign: 'center',
  },
  save: {
    flex: 1,
    maxHeight: 360,
    minHeight: 220,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { fontFamily: fonts.displayBold, fontSize: 56, letterSpacing: 2, color: colors.ground },
  result: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.accent, textAlign: 'center', minHeight: 26 },
});
