import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteControllerHost,
  remoteControllerPairWithCode,
  remoteControllerEndRecording,
  remoteControllerSave,
  remoteControllerStart,
  remoteControllerStop,
} from '../../modules/replay-camera';
import type { RemoteLink, RemotePairFailure, RemotePeer } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { ConnectionBar } from '../components/ConnectionBar';
import { DeviceNameField } from '../components/DeviceNameField';
import { HoldButton } from '../components/HoldButton';
import { PulseRing } from '../components/PulseRing';
import { ResultFlash } from '../components/ResultFlash';
import { parseCode } from '../remote/pairLink';
import { canSave, connectionTone, remoteScreen } from '../remote/remoteScreen';
import { cooldownLeft, IDLE, onResult, onTap, tick, type SaveFeedback } from '../remote/saveFeedback';
import { colors, fonts, radius } from '../theme/tokens';

const KEEP_AWAKE_TAG = 'remote';
const TICK_MS = 250;
const CONNECT_TIMEOUT_MS = 12_000;
const CAMERA_APP_URL = 'camera://';

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

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{String(n)}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

/** The second iPhone: shows the camera phone's game and taps Salvar for it. */
export default function Remote() {
  const [host, setHost] = useState<RemotePeer | null>(() => remoteControllerHost());
  const [link, setLink] = useState<RemoteLink>('idle');
  const [peerName, setPeerName] = useState<string | null>(null);
  const [received, setReceived] = useState<Received | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<SaveFeedback>(IDLE);
  const [lastSave, setLastSave] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<RemotePairFailure | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [code, setCode] = useState('');
  const lastSaveRef = useRef<number | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopConnectTimer = () => {
    if (connectTimer.current !== null) clearTimeout(connectTimer.current);
    connectTimer.current = null;
  };

  useEffect(() => {
    remoteControllerStart();
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      remoteControllerStop();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (connectTimer.current !== null) clearTimeout(connectTimer.current);
    };
  }, []);

  // Time moves everything on: the clock, and the save feedback (sending times out, results clear by themselves).
  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setFeedback((current) => tick(current, at));
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (feedback.phase === 'timeout') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [feedback.phase]);

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
      setFeedback((current) => onResult(current, e.saved, Date.now()));
      Haptics.notificationAsync(
        e.saved ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
    });
    const pairing = addReplayListener('onRemotePairing', (e) => {
      stopConnectTimer();
      setConnecting(false);
      if (e.phase === 'paired') {
        setNotice(null);
        setFailure(null);
        setReceived(null);
        setHost(remoteControllerHost());
        return;
      }
      if (e.reason === 'denied') {
        setHost(null);
        setReceived(null);
      }
      setFailure(e.reason);
      setNotice(failureText(e.reason));
    });
    return () => {
      status.remove();
      state.remove();
      saved.remove();
      pairing.remove();
    };
  }, []);

  const submit = (digits: string) => {
    setLastCode(digits);
    setNotice(null);
    setFailure(null);
    setConnecting(true);
    stopConnectTimer();
    // The camera phone may never answer (out of range, app closed): do not spin forever.
    connectTimer.current = setTimeout(() => {
      connectTimer.current = null;
      setConnecting(false);
      setFailure('notFound');
      setNotice(failureText('notFound'));
    }, CONNECT_TIMEOUT_MS);
    remoteControllerPairWithCode(digits);
  };

  const typeCode = (text: string) => {
    setCode(text);
    const digits = parseCode(text);
    if (digits !== null && !connecting) submit(digits);
  };

  const connect = () => {
    const digits = parseCode(code);
    if (digits === null) {
      setNotice('Digite os 6 números do código.');
      return;
    }
    submit(digits);
  };

  const retry = () => {
    if (lastCode !== null) submit(lastCode);
  };

  const openCameraApp = () => {
    setNotice(null);
    Linking.openURL(CAMERA_APP_URL).catch(() => {
      setNotice('Não consegui abrir. Abra o app Câmera do iPhone pela tela inicial.');
    });
  };

  // Opened straight from the QR code there is no screen behind this one: go to the start instead of doing nothing.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // The link looks lost: start the search over now instead of waiting for the next automatic try.
  const retryNow = () => {
    remoteControllerStop();
    remoteControllerStart();
  };

  const save = () => {
    const at = Date.now();
    if (!canSave(at, lastSaveRef.current)) {
      // Inside the gap between two saves: nothing is sent, but the tap is acknowledged.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    lastSaveRef.current = at;
    setLastSave(at);
    setNow(at);
    setFeedback((current) => onTap(current, at));
    remoteControllerSave();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  if (host === null) {
    return (
      <SafeAreaView style={styles.root}>
        <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.role}>ESTE IPHONE É O CONTROLE</Text>
          <Text style={styles.title}>Parear com a câmera</Text>
          {notice !== null ? <Text style={styles.warning}>{notice}</Text> : null}
          <Step n={1} text="No celular da câmera, toque no tile 'Celular'." />
          <Step n={2} text="Neste iPhone, abra o app Câmera e aponte para o código que aparecer lá." />
          <Button label="Abrir app Câmera" variant="secondary" onPress={openCameraApp} />
          <Text style={styles.text}>Ou digite o código de 6 dígitos:</Text>
          <TextInput
            accessibilityLabel="Código de 6 dígitos"
            editable={!connecting}
            keyboardType="number-pad"
            maxLength={7}
            onChangeText={typeCode}
            placeholder="000000"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={code}
          />
          <Button label={connecting ? 'Conectando…' : 'Conectar'} loading={connecting} onPress={connect} />
          {failure === 'notFound' && !connecting && lastCode !== null ? (
            <Button label="Tentar de novo" variant="secondary" onPress={retry} />
          ) : null}
          <DeviceNameField />
          <Button label="Fechar" variant="secondary" onPress={leave} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const hostLabel = host.name.length > 0 ? host.name : peerName === null ? 'Celular da câmera' : peerName;
  const screenModel = remoteScreen({
    link,
    hostName: hostLabel,
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
  const recordingDetail =
    screenModel.kind === 'recording'
      ? `${screenModel.startedAt === null ? '0:00' : clock((now - screenModel.startedAt) / 1000)} · ${screenModel.clipCount} ${screenModel.clipCount === 1 ? 'lance' : 'lances'}`
      : undefined;
  const sending = feedback.phase === 'sending';
  const left = cooldownLeft(lastSave, now);
  const flash = feedback.phase === 'saved' || feedback.phase === 'failed' || feedback.phase === 'timeout';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <ConnectionBar tone={connectionTone(screenModel)} name={hostLabel} detail={recordingDetail} />
        {screenModel.kind === 'recording' ? null : <Text style={styles.role}>ESTE IPHONE É O CONTROLE</Text>}
        {notice !== null ? <Text style={styles.warning}>{notice}</Text> : null}

        {screenModel.kind === 'denied' ? (
          <View style={styles.center}>
            <Text style={styles.text}>Libere a rede local nos Ajustes para usar o controle.</Text>
            <Button label="Abrir Ajustes" onPress={() => Linking.openSettings()} />
          </View>
        ) : null}

        {screenModel.kind === 'searching' ? (
          <View style={styles.center}>
            <PulseRing color={colors.warning} />
            <Text style={styles.status}>{`Procurando ${screenModel.hostName === null ? hostLabel : screenModel.hostName}…`}</Text>
          </View>
        ) : null}

        {screenModel.kind === 'waiting' ? (
          <View style={styles.center}>
            <PulseRing color={colors.accent} />
            <Text style={styles.status}>{`Conectado a ${screenModel.hostName}. Inicie a gravação no outro dispositivo.`}</Text>
          </View>
        ) : null}

        {screenModel.kind === 'stale' ? (
          <>
            <View style={styles.center}>
              <PulseRing color={colors.warning} size={64} />
              <Text style={styles.status}>{`Sem conexão com ${screenModel.hostName}`}</Text>
              <Text style={styles.sub}>Reconectando…</Text>
              <Button label="Tentar agora" variant="secondary" onPress={retryNow} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="SALVAR"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.save, styles.saveOff]}>
              <Text style={styles.saveText}>SALVAR</Text>
            </Pressable>
          </>
        ) : null}

        {screenModel.kind === 'recording' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="SALVAR"
            accessibilityState={{ busy: sending }}
            onPress={save}
            style={({ pressed }) => [styles.save, pressed && styles.savePressed]}>
            {sending ? (
              <>
                <ActivityIndicator size="large" color={colors.onAccent} />
                <Text style={styles.sendingText}>ENVIANDO…</Text>
              </>
            ) : (
              <Text style={styles.saveText}>SALVAR</Text>
            )}
            {left > 0 ? <View testID="cooldown" pointerEvents="none" style={[styles.cooldown, { width: `${Math.round(left * 100)}%` }]} /> : null}
          </Pressable>
        ) : null}

        {screenModel.kind === 'recording' ? (
          <HoldButton
            label="Segure para encerrar a gravação"
            holdingLabel="Continue segurando…"
            onComplete={remoteControllerEndRecording}
          />
        ) : null}

        <Button label="Fechar" variant="secondary" onPress={leave} />
      </View>
      {flash ? <ResultFlash kind={feedback.phase as 'saved' | 'failed' | 'timeout'} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1, padding: 20, gap: 16 },
  scrollBody: { flexGrow: 1, padding: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  role: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: colors.muted },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  text: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text },
  status: { fontFamily: fonts.bodySemi, fontSize: 22, lineHeight: 30, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.warning, textAlign: 'center' },
  warning: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21, color: colors.warning },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.onAccent },
  stepText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text },
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
    minHeight: 220,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  savePressed: { transform: [{ scale: 0.97 }] },
  saveOff: { opacity: 0.25 },
  saveText: { fontFamily: fonts.displayBold, fontSize: 72, letterSpacing: 2, color: colors.onAccent },
  sendingText: { fontFamily: fonts.displayBold, fontSize: 40, letterSpacing: 1, color: colors.onAccent },
  // A thin line along the bottom edge that shortens over the 3 s gap: it says "wait a moment" without looking like a loader.
  cooldown: { position: 'absolute', bottom: 0, left: 0, height: 8, backgroundColor: 'rgba(15,16,13,0.55)' },
});
