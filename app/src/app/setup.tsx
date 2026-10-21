import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  getSpeechPermission,
  getWatchStatus,
  isRemoteSupported,
  isVoiceSupported,
  remoteControllerForget,
  remoteControllerHost,
  remoteHostPeers,
  remoteHostControllers,
  ReplayCameraView,
  requestSpeechPermission,
} from '../../modules/replay-camera';
import type { RemotePeer, ReplayErrorCode } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { PositionGuide } from '../components/PositionGuide';
import { RecordingPanel } from '../components/RecordingPanel';
import { ArmsUpIcon, MicIcon, PhoneIcon, RemoteIcon, WatchIcon } from '../components/icons';
import { TriggerTile } from '../components/TriggerTile';
import { repo } from '../data/mmkv';
import type { ModeSettings, Prefs } from '../data/schema';
import { effectiveSettings, modeById, offeredMode, withModeOverride } from '../modes/registry';
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
  // The phone remote (a second iPhone that taps Salvar for this one). The camera phone waits for its paired remotes for
  // as long as the app is open (see the root layout); pairing happens on its own sheet (/pairing).
  const [remoteSupported] = useState(() => isRemoteSupported());
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>(() => (isRemoteSupported() ? remoteHostPeers() : []));
  const [controlHost, setControlHost] = useState<RemotePeer | null>(() =>
    isRemoteSupported() ? remoteControllerHost() : null,
  );
  const [remoteLinked, setRemoteLinked] = useState(() => remoteHostControllers());
  useEffect(() => {
    if (!remoteSupported) return;
    const sub = addReplayListener('onRemoteStatus', (e) =>
      setRemoteLinked(e.controllers === undefined ? 0 : e.controllers),
    );
    return () => sub.remove();
  }, [remoteSupported]);
  useEffect(() => {
    if (!remoteSupported || !focused) return;
    setRemotePeers(remoteHostPeers()); // the list may have changed on the pairing sheet
    setControlHost(remoteControllerHost()); // it may have been paired or forgotten on the remote screen
    setRemoteLinked(remoteHostControllers()); // the status events of a remote that connected meanwhile were not heard
  }, [remoteSupported, focused]);
  const disconnectControl = () => {
    const name = controlHost === null ? '' : controlHost.name;
    Alert.alert(
      `Esquecer ${name}?`,
      'Este celular deixa de ser o controle dessa câmera. Para usar de novo, é preciso parear outra vez.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Esquecer',
          style: 'destructive',
          onPress: () => {
            remoteControllerForget();
            setControlHost(null);
          },
        },
      ],
    );
  };
  const remoteStatus =
    remotePeers.length === 0
      ? 'Toque para conectar'
      : remoteLinked > 0
        ? remotePeers.length === 1
          ? `Conectado: ${remotePeers[0].name}`
          : `${remoteLinked} de ${remotePeers.length} conectados`
        : remotePeers.length === 1
          ? `Pareado: ${remotePeers[0].name}`
          : `${remotePeers.length} controles pareados`;
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

  const summary = `Ajustes: ${[
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

  // The remote phone's "Iniciar gravação": starts a game from whatever screen is in front (the summary of the last game,
  // say), as long as no game is running.
  useEffect(() => {
    const sub = addReplayListener('onRemoteStart', () => {
      if (starting) return;
      if (phase !== 'idle' && !(phase === 'ended' && error === undefined)) return;
      router.navigate('/setup');
      void session.start(modeId);
    });
    return () => sub.remove();
  });

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
          {mode.tip.length > 0 ? (
            <View style={styles.tip}>
              <Text style={styles.tipText}>{mode.tip}</Text>
            </View>
          ) : null}
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
        <View style={styles.summaryHead}>
          <Text style={styles.section}>COMO SALVAR O CLIPE</Text>
        </View>
        <View style={styles.summaryIcons}>
          <MicIcon color={iconColor(voiceOn)} size={32} />
          <ArmsUpIcon color={iconColor(settings.gestureEnabled)} size={32} />
          <RemoteIcon color={iconColor(remoteWorks)} size={32} />
          <WatchIcon color={iconColor(watch === 'ready')} size={32} />
          {remoteSupported ? <PhoneIcon color={iconColor(remoteLinked > 0)} size={32} /> : null}
        </View>
      </Pressable>
    );
  }

  function renderSettings() {
    return (
      <>
        <Text style={styles.section}>GATILHOS</Text>
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
              title="Controle Bluetooth"
              status={remoteWorks ? 'Funcionando' : 'Aperte um botão para testar'}
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

        {remoteSupported ? (
          <>
            <Text style={styles.section}>SEGUNDO CELULAR</Text>
            <TriggerTile
              icon={<PhoneIcon />}
              title="Outro celular como controle"
              status={remoteStatus}
              active={remoteLinked > 0}
              onPress={() => router.push('/pairing')}
            />
            <View style={styles.remoteRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={controlHost === null ? 'Usar este celular como controle' : 'Abrir controle'}
                hitSlop={8}
                onPress={() => router.push('/remote')}
                style={styles.remoteMain}>
                <RemoteIcon color={colors.accent} size={18} />
                <Text numberOfLines={1} style={[styles.remoteMainText, controlHost === null && styles.remoteUnderline]}>
                  {controlHost === null ? 'Usar este celular como controle' : `Controle: ${controlHost.name}`}
                </Text>
                {controlHost === null ? null : <Text style={styles.remoteAction}>Conectar</Text>}
              </Pressable>
              {controlHost !== null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Desconectar deste celular"
                  hitSlop={8}
                  onPress={disconnectControl}
                  style={styles.remoteLinkBox}>
                  <Text style={styles.remoteLink}>Desconectar</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}

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
  pillButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.onAccent,
  },
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
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  summary: { gap: 8, minHeight: 44 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  summaryChevron: { fontSize: 12, color: colors.muted },
  summaryIcons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', minHeight: 48 },
  section: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  remoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  remoteMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  remoteMainText: {
    flexShrink: 1,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  remoteUnderline: { textDecorationLine: 'underline' },
  remoteAction: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.accent,
  },
  remoteLinkBox: { minHeight: 48, justifyContent: 'center' },
  remoteLink: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.soft,
    textDecorationLine: 'underline',
  },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
