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
import { useT } from '../i18n/useT';
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
  const { t } = useT();
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
        <Text style={styles.role}>{t('pairing.roleCamera')}</Text>
        <Text style={styles.title}>{t('pairing.title')}</Text>

        {paired !== null ? (
          <View style={styles.done}>
            <View style={styles.doneBadge}>
              <CheckIcon size={64} />
            </View>
            <Text style={styles.success}>{t('pairing.paired', { name: paired })}</Text>
          </View>
        ) : full ? (
          <Text style={styles.warning}>{t('pairing.full')}</Text>
        ) : (
          <>
            <View style={styles.steps}>
              <Step n={1} text={t('pairing.step1')} />
              <Step n={2} text={t('pairing.step2')} />
            </View>
            {offer !== null ? (
              <>
                <View style={[styles.qr, expired && styles.dim]}>
                  <Image
                    accessibilityLabel={t('pairing.qrLabel')}
                    source={{ uri: `file://${offer.qrPath}` }}
                    style={styles.qrImage}
                  />
                </View>
                <Text style={styles.fallback}>{t('pairing.typeInstead')}</Text>
                <Text style={[styles.code, expired && styles.dim]}>{offer.code}</Text>
                {expired ? null : (
                  <View style={styles.waiting}>
                    <PulseRing color={colors.accent} size={28} />
                    <Text style={styles.waitingText}>{t('pairing.waiting')}</Text>
                  </View>
                )}
                <Text style={expired ? styles.warning : styles.countdown}>
                  {expired ? t('pairing.expired') : t('pairing.validFor', { time: clock(secondsLeft) })}
                </Text>
                <Text style={styles.note}>{t('pairing.needsApp')}</Text>
              </>
            ) : (
              <Text style={styles.warning}>{t('pairing.codeFailed')}</Text>
            )}
            <Button label={t('pairing.newCode')} variant="secondary" onPress={open} />
          </>
        )}

        {peers.length > 0 ? (
          <View style={styles.list}>
            <Text style={styles.section}>{t('pairing.remotes')}</Text>
            {peers.map((peer) => (
              <View key={peer.id} style={styles.peer}>
                <Text style={styles.peerName}>{peer.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('pairing.removeName', { name: peer.name })}
                  hitSlop={8}
                  onPress={() => remove(peer.id)}
                  style={styles.remove}>
                  <Text style={styles.removeText}>{t('pairing.remove')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <DeviceNameField />

        <Button label={t('common.close')} variant="secondary" onPress={() => router.back()} />
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
