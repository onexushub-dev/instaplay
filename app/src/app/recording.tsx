import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReplayCameraView } from '../../modules/replay-camera';
import { Button } from '../components/Button';
import { RemoteIcon, WatchIcon, XArmsIcon } from '../components/icons';
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

  return (
    <View style={styles.root}>
      <ReplayCameraView style={[StyleSheet.absoluteFill, styles.dimmed]} />

      <SafeAreaView style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.pill}>
            <View style={styles.recDot} />
            <Text style={styles.pillLabel}>Gravando</Text>
            <Text style={styles.elapsed}>{clock(now - (state.startedAt ?? now))}</Text>
          </View>
        </View>

        {state.thermal.degraded ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              <Text style={styles.bold}>Celular quente. </Text>
              Passamos para 720p/30 para não parar a gravação. Coloque na sombra se puder.
            </Text>
          </View>
        ) : null}
        {state.paused ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Gravação pausada. Volte para o app para continuar.</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toque em qualquer lugar para salvar o lance"
          onPress={() => trigger('screen')}
          style={styles.tapArea}>
          <View style={styles.ring}>
            <Text style={styles.count}>{state.clipCount}</Text>
            <Text style={styles.countLabel}>lances salvos</Text>
          </View>
          <Text style={styles.tapText}>{'Toque em qualquer lugar\npara salvar o lance'}</Text>
        </Pressable>

        <View style={styles.bufferLabels}>
          <Text style={styles.small}>Últimos 60s prontos</Text>
          <Text style={styles.small}>o resto é apagado</Text>
        </View>
        <View style={styles.bufferBar} />

        <View style={styles.triggers}>
          <View style={styles.trigger}>
            <XArmsIcon color={colors.accent} />
            <Text style={styles.triggerText}>Gesto X</Text>
          </View>
          <View style={styles.trigger}>
            <RemoteIcon color={colors.accent} />
            <Text style={styles.triggerText}>Controle</Text>
          </View>
          <View style={[styles.trigger, styles.off]}>
            <WatchIcon color={colors.muted} />
            <Text style={styles.triggerText}>Relógio</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Segure para encerrar o jogo"
          delayLongPress={1000}
          onLongPress={() => void end()}
          style={styles.stop}>
          <Text style={styles.stopText}>Segure para encerrar o jogo</Text>
        </Pressable>
      </SafeAreaView>

      {showOverlay ? <SavedOverlay number={last.number} source={last.source} onUndo={undoLast} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.recordingGround },
  dimmed: { opacity: 0.16 },
  content: { flex: 1, paddingHorizontal: 20, gap: 16 },
  topRow: { flexDirection: 'row', marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.rec },
  pillLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  elapsed: { fontFamily: fonts.display, fontSize: 18, color: colors.text, fontVariant: ['tabular-nums'] },
  banner: { backgroundColor: colors.warningGround, borderColor: colors.warning, borderWidth: 1, borderRadius: 14, padding: 12 },
  bannerText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text },
  bold: { fontFamily: fonts.bodyBold },
  tapArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, borderRadius: 28, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#2E3129' },
  ring: { width: 210, height: 210, borderRadius: 105, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: fonts.displayBold, fontSize: 84, lineHeight: 84, color: colors.accent },
  countLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
  tapText: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, color: colors.text, textAlign: 'center' },
  bufferLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  bufferBar: { height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: -8 },
  triggers: { flexDirection: 'row', gap: 8 },
  trigger: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 10 },
  off: { opacity: 0.5 },
  triggerText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  stop: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stopText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  stopped: { flex: 1, backgroundColor: colors.recordingGround, justifyContent: 'center', padding: 24, gap: 20 },
  stoppedText: { fontFamily: fonts.displayBold, fontSize: 36, color: colors.text, textAlign: 'center' },
});
