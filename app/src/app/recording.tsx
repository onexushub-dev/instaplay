import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReplayCameraView } from '../../modules/replay-camera';
import { Button } from '../components/Button';
import { HoldButton } from '../components/HoldButton';
import { RemoteIcon, TapIcon, WatchIcon, XArmsIcon } from '../components/icons';
import { SavedOverlay } from '../components/SavedOverlay';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';

const OVERLAY_MS = 2000;

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export default function Recording() {
  // The phone sits untouched on the fence: auto-lock would background the app and stop recording.
  useKeepAwake();
  const { state, trigger, undoLast, stop } = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string>();
  const last = state.lastSaved;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!last) return;
    const hide = setTimeout(() => setDismissed(last.clipId), OVERLAY_MS);
    return () => clearTimeout(hide);
  }, [last]);

  async function end() {
    const id = await stop();
    if (id) router.replace(`/session/${id}`);
  }

  // Android back = end the game, after a confirmation.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('Encerrar o jogo?', undefined, [
        { text: 'Continuar', style: 'cancel' },
        { text: 'Encerrar', style: 'destructive', onPress: () => void end() },
      ]);
      return true;
    });
    return () => sub.remove();
  });

  if (state.phase === 'ended' && state.error) {
    const reason = state.thermalStop ? 'celular muito quente' : 'erro na câmera';
    return (
      <SafeAreaView style={styles.stopped}>
        <Text style={styles.stoppedText}>{`A gravação parou: ${reason}`}</Text>
        <Button label="Ver lances" onPress={() => router.replace(`/session/${state.sessionId}`)} />
      </SafeAreaView>
    );
  }

  const showOverlay = last !== undefined && dismissed !== last.clipId;
  const clips = `${state.clipCount} ${state.clipCount === 1 ? 'lance' : 'lances'}`;

  return (
    <View style={styles.root}>
      <ReplayCameraView style={StyleSheet.absoluteFill} />

      {/* The whole screen is the save button; nothing covers the picture. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toque em qualquer lugar para salvar o lance"
        onPress={() => trigger('screen')}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView pointerEvents="box-none" style={styles.content}>
        <View pointerEvents="none" style={styles.topRow}>
          <View style={styles.pill}>
            <View style={styles.recDot} />
            <Text style={styles.pillLabel}>Gravando</Text>
            <Text style={styles.elapsed}>{clock(now - (state.startedAt ?? now))}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.countText}>{clips}</Text>
          </View>
        </View>

        {state.thermal.degraded ? (
          <View pointerEvents="none" style={styles.banner}>
            <Text style={styles.bannerText}>
              <Text style={styles.bold}>Celular quente. </Text>
              Passamos para 720p/30 para não parar a gravação. Coloque na sombra se puder.
            </Text>
          </View>
        ) : null}
        {state.paused ? (
          <View pointerEvents="none" style={styles.banner}>
            <Text style={styles.bannerText}>Gravação pausada. Volte para o app para continuar.</Text>
          </View>
        ) : null}

        <View pointerEvents="box-none" style={styles.bottom}>
          <View pointerEvents="none" style={styles.hintCard}>
            <TapIcon color={colors.accent} size={28} />
            <View style={styles.hintText}>
              <Text style={styles.hint}>Toque na tela para salvar o lance</Text>
              <Text style={styles.hintSub}>Últimos 60s prontos · ou faça o X · ou use o controle</Text>
            </View>
            <View style={styles.icons}>
              <XArmsIcon color={colors.accent} size={20} />
              <RemoteIcon color={colors.accent} size={20} />
              <WatchIcon color={colors.muted} size={20} />
            </View>
          </View>
          <HoldButton label="Segure para encerrar o jogo" holdingLabel="Continue segurando…" onComplete={() => void end()} />
        </View>
      </SafeAreaView>

      {showOverlay ? <SavedOverlay number={last.number} source={last.source} onUndo={undoLast} /> : null}
    </View>
  );
}

const glass = 'rgba(15,16,13,0.72)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.recordingGround },
  content: { flex: 1, paddingHorizontal: 16, gap: 10 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: glass, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.rec },
  pillLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  elapsed: { fontFamily: fonts.display, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  countText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.accent },
  banner: { backgroundColor: colors.warningGround, borderColor: colors.warning, borderWidth: 1, borderRadius: 14, padding: 12 },
  bannerText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
  bold: { fontFamily: fonts.bodyBold },
  bottom: { marginTop: 'auto', gap: 8, marginBottom: 12 },
  hintCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: glass, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  hintText: { flex: 1, gap: 2 },
  hint: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 22, color: colors.text },
  hintSub: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
  icons: { flexDirection: 'column', gap: 6 },
  stopped: { flex: 1, backgroundColor: colors.recordingGround, justifyContent: 'center', padding: 24, gap: 20 },
  stoppedText: { fontFamily: fonts.displayBold, fontSize: 36, color: colors.text, textAlign: 'center' },
});
