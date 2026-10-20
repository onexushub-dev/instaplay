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
import { colors, fonts, radius } from '../theme/tokens';

const LIMIT = 4;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

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

  // The camera phone tells us when a remote connected: that is how we know the pairing worked.
  useEffect(() => {
    const sub = addReplayListener('onRemoteStatus', () => {
      const added = readPeers();
      if (added) setPaired(added.name);
    });
    return () => sub.remove();
  }, [readPeers]);

  const remove = (id: string) => {
    remoteHostRemove(id);
    if (offer === null) open();
    else readPeers();
  };

  const full = offer === null && peers.length >= LIMIT;
  const secondsLeft = offer === null ? 0 : Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
  const expired = offer !== null && secondsLeft === 0;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Parear um celular como controle</Text>

        {paired !== null ? (
          <>
            <Text style={styles.success}>{`Pronto! ${paired} agora é um controle.`}</Text>
            <Button label="Parear outro controle" variant="secondary" onPress={open} />
          </>
        ) : full ? (
          <Text style={styles.warning}>Limite de 4 controles. Remova um para parear outro.</Text>
        ) : (
          <>
            <Text style={styles.instruction}>
              {"No celular que vai ser o controle, abra o app Câmera do iPhone (o da câmera normal) e aponte para este código. Depois toque em 'Abrir no LANCE'."}
            </Text>
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

        <Button label="Fechar" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: 20, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  instruction: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23, color: colors.text },
  qr: { alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: radius.card },
  qrImage: { width: 220, height: 220 },
  fallback: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  code: { fontFamily: fonts.displayBold, fontSize: 56, letterSpacing: 6, color: colors.accent, textAlign: 'center' },
  countdown: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.muted, textAlign: 'center' },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  dim: { opacity: 0.35 },
  success: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.accent },
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
