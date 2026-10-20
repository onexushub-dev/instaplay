import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  getSpeechPermission,
  getWatchStatus,
  isVoiceSupported,
  ReplayCameraView,
  requestSpeechPermission,
} from '../../modules/replay-camera';
import type { ReplayErrorCode } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { PositionGuide } from '../components/PositionGuide';
import { RecordingPanel } from '../components/RecordingPanel';
import { ArmsUpIcon, MicIcon, RemoteIcon, WatchIcon } from '../components/icons';
import { TriggerTile } from '../components/TriggerTile';
import { repo } from '../data/mmkv';
import type { ModeId, ModeSettings, Prefs } from '../data/schema';
import { effectiveSettings, MODES, modeById, offeredMode, withModeOverride } from '../modes/registry';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';
import { useVolumeRemote } from '../triggers/useVolumeRemote';

const START_ERRORS: Partial<Record<ReplayErrorCode, string>> = {
  LOW_STORAGE: 'Pouco espaço no celular. Libere pelo menos 500 MB para gravar.',
  CAMERA_PERMISSION: 'Sem câmera não dá para gravar os clipes. Libere em Ajustes.',
};

export default function Setup() {
  const session = useSession();
  // This screen stays mounted under Minhas gravações, the editor and the save screen: only hold the camera,
  // the volume buttons and the screen awake while it is the visible one.
  const focused = useIsFocused();
  const [prefs, setPrefsState] = useState<Prefs>(() => repo.getPrefs());
  const update = (patch: Partial<Prefs>) => setPrefsState(repo.setPrefs(patch));
  // What this mode runs with (defaults + the player's changes for this mode).
  // A sport saved before the two modes opens as its group (Quadra or Academia).
  const modeId = offeredMode(prefs.sport);
  const settings = effectiveSettings(modeId, prefs);
  const updateMode = (patch: Partial<ModeSettings>) => update(withModeOverride(prefs, modeId, patch));
  const [remoteWorks, setRemoteWorks] = useState(false);
  // The sheet opens collapsed so the camera and its guide stay visible; mode and triggers sit behind the summary.
  const [expanded, setExpanded] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  // Swipe up on the sheet opens it, swipe down closes it; taps still reach the controls inside.
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => setExpanded(g.dy < 0),
    }),
  );
  const [speechDenied, setSpeechDenied] = useState(false);
  // Offline recognition only: court audio is never streamed to a server.
  const [voiceSupported] = useState(() => isVoiceSupported());
  const [speech, setSpeech] = useState(() => getSpeechPermission());
  const speechGranted = speech === 'granted';
  const mode = modeById(modeId);
  // The watch link: paired watch with the app → ready. Informational: the watch itself starts a save.
  const [watch, setWatch] = useState(() => getWatchStatus());
  useEffect(() => {
    const sub = addReplayListener('onWatchStatus', (e) => setWatch(e.status));
    return () => sub.remove();
  }, []);
  const watchStatus =
    watch === 'ready' ? 'Pronto' : watch === 'notInstalled' ? 'Instale o app no relógio' : 'Sem relógio pareado';
  // Voice counts as on only when this mode wants it and the phone may listen.
  const voiceOn = voiceSupported && settings.voiceEnabled && speechGranted;
  const voiceStatus = !voiceSupported
    ? 'Indisponível neste celular'
    : !settings.voiceEnabled
      ? 'Desligado'
      : speechGranted
        ? 'Diga “salvar” ou “gravar”'
        : speech === 'denied'
          ? 'Negado · libere em Ajustes'
          : 'Toque para permitir';

  async function toggleVoice() {
    if (voiceOn) return updateMode({ voiceEnabled: false });
    const granted = speechGranted || (await requestSpeechPermission());
    setSpeech(granted ? 'granted' : 'denied');
    setSpeechDenied(!granted);
    if (granted) updateMode({ voiceEnabled: true });
  }

  const chooseMode = (id: ModeId) => {
    update({ sport: id });
    setExpanded(false);
  };
  const summary = `Ajustes: ${mode.label} · ${[
    `voz ${voiceOn ? 'ligada' : 'desligada'}`,
    `acenar com os braços ${settings.gestureEnabled ? 'ligado' : 'desligado'}`,
    `controle ${remoteWorks ? 'funcionando' : 'não testado'}`,
    ...(watch === 'ready' ? ['relógio pronto'] : []),
  ].join(', ')}`;

  const { phase, error, camera } = session.state;
  const { prepare, release } = session;

  // Live preview while positioning; the buffer starts filling now, so "Começar a gravar" is instant.
  useEffect(() => {
    if (focused) void prepare(modeId);
    else void release();
  }, [focused, prepare, release, modeId, settings.lens]);

  useEffect(() => {
    if (!focused) return;
    void activateKeepAwakeAsync('setup');
    return () => void deactivateKeepAwake('setup');
  }, [focused]);

  // A press of the Bluetooth remote here proves it is paired and reaching the app.
  useVolumeRemote(focused && phase === 'idle', () => setRemoteWorks(true));

  const opening = camera === 'starting';
  const starting = phase === 'starting' || opening;
  const errorText = error ? (START_ERRORS[error] ?? 'Não foi possível abrir a câmera. Tente de novo.') : null;

  const inGame = phase === 'recording' || phase === 'stopping' || (phase === 'ended' && error !== undefined);

  // One camera view for the whole game: setup and recording only swap the controls drawn over it.
  return (
    <View style={styles.root}>
      <ReplayCameraView style={StyleSheet.absoluteFill} />
      {inGame ? (
        <RecordingPanel bufferSeconds={settings.bufferSeconds} gesture={settings.gestureEnabled} voice={voiceOn} />
      ) : (
        renderSetupControls()
      )}
    </View>
  );

  function renderSetupControls() {
    return (
      <>
        <View testID="guide-area" pointerEvents="none" style={[styles.guideArea, { bottom: sheetHeight }]}>
          <PositionGuide guide={mode.guide} />
        </View>

        <SafeAreaView edges={['top']} style={styles.top}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Minhas gravações"
              onPress={() => router.push('/games')}
              style={[styles.pill, styles.pillButton]}>
              <Text style={styles.pillText}>Minhas gravações</Text>
            </Pressable>
            <View style={styles.lens}>
              {(['ultraWide', 'wide'] as const).map((lens) => (
                <Pressable
                  key={lens}
                  accessibilityRole="button"
                  accessibilityLabel={lens === 'ultraWide' ? '0.5x' : '1x'}
                  accessibilityState={{ selected: settings.lens === lens }}
                  onPress={() => updateMode({ lens })}
                  style={[styles.lensButton, settings.lens === lens && styles.lensOn]}>
                  <Text style={[styles.lensText, settings.lens === lens && { color: colors.onAccent }]}>
                    {lens === 'ultraWide' ? '0.5x' : '1x'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.tip}>
            <Text style={styles.tipText}>{mode.tip}</Text>
          </View>
        </SafeAreaView>

        <View testID="setup-sheet" style={styles.sheet} onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}>
          <SafeAreaView edges={['bottom']} style={styles.sheetBody} {...swipe.panHandlers}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Fechar ajustes' : 'Abrir ajustes'}
              onPress={() => setExpanded(!expanded)}
              hitSlop={12}
              style={styles.handleArea}>
              <View style={styles.handle} />
            </Pressable>
            {expanded ? renderSettings() : renderSummary()}

            {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
            <Button
              label={opening ? 'Abrindo a câmera…' : 'Começar a gravar'}
              icon={starting ? <ActivityIndicator color={colors.onAccent} /> : undefined}
              disabled={starting}
              onPress={() => session.start(modeId)}
            />
          </SafeAreaView>
        </View>
      </>
    );
  }

  function renderSummary() {
    const iconColor = (on: boolean) => (on ? colors.accent : colors.muted);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary}
        onPress={() => setExpanded(true)}
        style={styles.summary}>
        <Text style={styles.summaryMode}>{mode.label} ▾</Text>
        <View style={styles.summaryIcons}>
          <MicIcon color={iconColor(voiceOn)} />
          <ArmsUpIcon color={iconColor(settings.gestureEnabled)} size={20} />
          <RemoteIcon color={iconColor(remoteWorks)} />
          <WatchIcon color={iconColor(watch === 'ready')} />
        </View>
      </Pressable>
    );
  }

  function renderSettings() {
    return (
      <>
        <View style={styles.modeHeader}>
          <Text style={styles.section}>MODO</Text>
          <View style={styles.chips}>
            {MODES.map((m) => (
              <Chip key={m.id} label={m.label} selected={modeId === m.id} onPress={() => chooseMode(m.id)} />
            ))}
          </View>
        </View>

        <Text style={styles.section}>COMO SALVAR O CLIPE</Text>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <TriggerTile
              icon={<MicIcon />}
              title="Voz"
              status={voiceStatus}
              active={voiceOn}
              disabled={!voiceSupported}
              onPress={voiceSupported ? () => void toggleVoice() : undefined}
            />
            <TriggerTile
              icon={<ArmsUpIcon />}
              title="Acenar com os braços"
              status={settings.gestureEnabled ? 'Ativo' : 'Desligado'}
              active={settings.gestureEnabled}
              onPress={() => updateMode({ gestureEnabled: !settings.gestureEnabled })}
            />
          </View>
          <View style={styles.gridRow}>
            <TriggerTile
              icon={<RemoteIcon />}
              title="Controle"
              status={remoteWorks ? 'Funcionando' : 'Aperte para testar'}
              active={remoteWorks}
            />
            <TriggerTile
              icon={<WatchIcon />}
              title="Relógio"
              status={watchStatus}
              active={watch === 'ready'}
              disabled={watch === 'unsupported'}
            />
          </View>
        </View>

        {speechDenied ? <Text style={styles.error}>Libere o reconhecimento de fala em Ajustes.</Text> : null}

        <View style={styles.feedbackRow}>
          <Text style={styles.section}>AVISOS AO SALVAR</Text>
          <View style={styles.chips}>
            <Chip
              label="Som"
              selected={prefs.soundOnSave}
              onPress={() => update({ soundOnSave: !prefs.soundOnSave })}
            />
            <Chip
              label="Flash"
              selected={prefs.flashOnSave}
              onPress={() => update({ flashOnSave: !prefs.flashOnSave })}
            />
          </View>
        </View>
      </>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  top: { position: 'absolute', top: 0, left: 16, right: 16, gap: 8 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  pill: {
    backgroundColor: 'rgba(15,16,13,0.75)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  pillButton: { minHeight: 44, justifyContent: 'center' },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  lens: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15,16,13,0.75)',
    borderRadius: 999,
    padding: 4,
    gap: 2,
  },
  lensButton: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensOn: { backgroundColor: colors.accent },
  lensText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  tip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(15,16,13,0.8)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  tipText: { fontFamily: fonts.body, fontSize: 12, color: colors.soft },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetBody: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  guideArea: { position: 'absolute', top: 0, left: 0, right: 0 },
  handleArea: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 40,
    minHeight: 24,
    justifyContent: 'center',
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.muted },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  summaryMode: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  summaryIcons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
  modeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
