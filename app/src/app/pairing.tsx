import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  remoteHostBeginPairing,
  remoteHostEndPairing,
  remoteHostPeers,
  remoteHostRemove,
} from '../../modules/replay-camera';
import type { RemotePairing, RemotePeer } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { DeviceNameField } from '../components/DeviceNameField';
import { CheckIcon } from '../components/icons';
import { PulseRing } from '../components/PulseRing';
import { colors, fonts, radius } from '../theme/tokens';

const LIMIT = 4;
/** A code is good for two minutes; building the QR image takes a moment, so the offer can look slightly longer. */
const VALID_SECONDS = 120;
const CLOSE_AFTER_MS = 1500;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

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

/** The camera phone's side of pairing: a QR code and a 6-digit code for the phone that will be the remote. */
export default function Pairing() {
  const [offer, setOffer] = useState<RemotePairing | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [paired, setPaired] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const peersRef = useRef<RemotePeer[]>([]);

  /** Reads the paired remotes; returns the one that was not there before, if any. */
  const readPeers = useCallback((): RemotePeer | undefined => {
    const list = remoteHostPeers();
    const added = list.find((p) => !peersRef.current.some((before) => before.id === p.id));
    peersRef.current = list;
    setPeers(list);
    return added;
  }, []);

  const open = useCallback(() => {
    readPeers();
    setPaired(null);
    setNow(Date.now());
    setOffer(remoteHostBeginPairing());
  }, [readPeers]);

  useEffect(() => {
    open();
    return () => remoteHostEndPairing();
  }, [open]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Once a remote has paired the sheet has done its job: show the check for a moment and go back to the setup screen.
  useEffect(() => {
    if (paired === null) return;
    const id = setTimeout(() => router.back(), CLOSE_AFTER_MS);
    return () => clearTimeout(id);
  }, [paired]);

  // The camera phone tells us when a remote connected: that is how we know the pairing worked.
  useEffect(() => {
    const sub = addReplayListener('onRemoteStatus', () => {
      const added = readPeers();
      if (added) setPaired(added.name);
    });
    return () => sub.remove();
  }, [readPeers]);

  // Pairing the same remote again replaces its entry, so it is not "a new peer": the host says so itself.
  useEffect(() => {
    const sub = addReplayListener('onRemotePairing', (e) => {
      if (e.phase !== 'paired') return;
      readPeers();
      setPaired(e.peer.name);
    });
    return () => sub.remove();
  }, [readPeers]);

  const remove = (id: string) => {
    remoteHostRemove(id);
    if (offer === null) open();
    else readPeers();
  };

  const full = offer === null && peers.length >= LIMIT;
  const secondsLeft = offer === null ? 0 : Math.min(VALID_SECONDS, Math.max(0, Math.ceil((offer.expiresAt - now) / 1000)));
  const expired = offer !== null && secondsLeft === 0;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.role}>ESTE IPHONE É A CÂMERA</Text>
        <Text style={styles.title}>Parear um celular como controle</Text>

        {paired !== null ? (
          <View style={styles.done}>
            <View style={styles.doneBadge}>
              <CheckIcon size={64} />
            </View>
            <Text style={styles.success}>{`Pronto! ${paired} agora é um controle.`}</Text>
          </View>
        ) : full ? (
          <Text style={styles.warning}>Limite de 4 controles. Remova um para parear outro.</Text>
        ) : (
          <>
            <View style={styles.steps}>
              <Step n={1} text="No outro iPhone, abra o app Câmera (o da câmera normal)." />
              <Step n={2} text="Aponte para este código." />
              <Step n={3} text="Toque em 'Abrir no LANCE'." />
            </View>
            {offer !== null ? (
              <>
                <View style={[styles.qr, expired && styles.dim]}>
                  <Image
                    accessibilityLabel="Código QR para parear"
                    source={{ uri: `file://${offer.qrPath}` }}
                    style={styles.qrImage}
                  />
                </View>
                <Text style={styles.fallback}>
                  {"Não leu? Abra o LANCE no controle, toque em 'Usar este celular como controle' e digite o código:"}
                </Text>
                <Text style={[styles.code, expired && styles.dim]}>{offer.code}</Text>
                {expired ? null : (
                  <View style={styles.waiting}>
                    <PulseRing color={colors.accent} size={28} />
                    <Text style={styles.waitingText}>Aguardando o controle…</Text>
                  </View>
                )}
                <Text style={expired ? styles.warning : styles.countdown}>
                  {expired ? 'Código vencido. Gere um novo.' : `Válido por ${clock(secondsLeft)}`}
                </Text>
                <Text style={styles.note}>O LANCE precisa estar instalado no celular controle.</Text>
              </>
            ) : (
              <Text style={styles.warning}>Não foi possível gerar o código. Tente de novo.</Text>
            )}
            <Button label="Gerar novo código" variant="secondary" onPress={open} />
          </>
        )}

        {peers.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.section}>Controles pareados</Text>
            {peers.map((peer) => (
              <View key={peer.id} style={styles.peer}>
                <Text style={styles.peerName}>{peer.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${peer.name}`}
                  hitSlop={8}
                  onPress={() => remove(peer.id)}
                  style={styles.remove}>
                  <Text style={styles.removeText}>Remover</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <DeviceNameField />

        <Button label="Fechar" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: 20, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  role: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, color: colors.muted },
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onAccent },
  stepText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waitingText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.accent },
  done: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  doneBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: radius.card },
  qrImage: { width: 220, height: 220 },
  fallback: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  code: { fontFamily: fonts.displayBold, fontSize: 56, letterSpacing: 6, color: colors.accent, textAlign: 'center' },
  countdown: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textAlign: 'center' },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  dim: { opacity: 0.35 },
  success: { fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 28, color: colors.accent, textAlign: 'center' },
  warning: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.warning },
  list: { gap: 8 },
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  peer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  peerName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  remove: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  removeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
});
