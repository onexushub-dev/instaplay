import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSpeechPermission, isVoiceSupported, ReplayCameraView, requestSpeechPermission } from '../../modules/replay-camera';
import type { ReplayErrorCode } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { PositionGuide } from '../components/PositionGuide';
import { RecordingPanel } from '../components/RecordingPanel';
import { ArmsUpIcon, MicIcon, RemoteIcon, WatchIcon } from '../components/icons';
import { TriggerTile } from '../components/TriggerTile';
import { repo } from '../data/mmkv';
import type { ModeSettings, Prefs } from '../data/schema';
import { effectiveSettings, type ModeGroup, modeById, modesIn, withModeOverride } from '../modes/registry';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';
import { useVolumeRemote } from '../triggers/useVolumeRemote';


const START_ERRORS: Partial<Record<ReplayErrorCode, string>> = {
  LOW_STORAGE: 'Pouco espaço no celular. Libere pelo menos 500 MB para gravar.',
  CAMERA_PERMISSION: 'Sem câmera não dá para gravar os lances. Libere em Ajustes.',
};

export default function Setup() {
  const session = useSession();
  // This screen stays mounted under Meus jogos, the editor and the Story screen: only hold the camera,
  // the volume buttons and the screen awake while it is the visible one.
  const focused = useIsFocused();
  const [prefs, setPrefsState] = useState<Prefs>(() => repo.getPrefs());
  const update = (patch: Partial<Prefs>) => setPrefsState(repo.setPrefs(patch));
  // What this mode runs with (defaults + the player's changes for this mode).
  const settings = effectiveSettings(prefs.sport, prefs);
  const updateMode = (patch: Partial<ModeSettings>) => update(withModeOverride(prefs, prefs.sport, patch));
  const [remoteWorks, setRemoteWorks] = useState(false);
  const [speechDenied, setSpeechDenied] = useState(false);
  // Offline recognition only: court audio is never streamed to a server.
  const [voiceSupported] = useState(() => isVoiceSupported());
  const [speechGranted, setSpeechGranted] = useState(() => getSpeechPermission() === 'granted');
  const mode = modeById(prefs.sport);
  // Voice counts as on only when this mode wants it and the phone may listen.
  const voiceOn = voiceSupported && settings.voiceEnabled && speechGranted;
  const voiceStatus = !voiceSupported
    ? 'Indisponível neste celular'
    : !settings.voiceEnabled
      ? 'Desligado'
      : speechGranted
        ? 'Diga “salvar” ou “gravar”'
        : 'Toque para permitir';

  async function toggleVoice() {
    if (voiceOn) return updateMode({ voiceEnabled: false });
    const granted = speechGranted || (await requestSpeechPermission());
    setSpeechGranted(granted);
    setSpeechDenied(!granted);
    if (granted) updateMode({ voiceEnabled: true });
  }

  const chooseGroup = (group: ModeGroup) => {
    if (mode.group !== group) update({ sport: modesIn(group)[0].id });
  };
  const { phase, error, camera } = session.state;
  const { prepare, release } = session;

  // Live preview while positioning; the buffer starts filling now, so "Começar jogo" is instant.
  useEffect(() => {
    if (focused) void prepare(prefs.sport);
    else void release();
  }, [focused, prepare, release, prefs.sport, settings.lens]);

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
      {inGame ? <RecordingPanel /> : renderSetupControls()}
    </View>
  );

  function renderSetupControls() {
    return (
      <>
        <PositionGuide guide={mode.guide} />

        <SafeAreaView edges={['top']} style={styles.top}>
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Meus jogos"
              onPress={() => router.push('/games')}
              style={[styles.pill, styles.pillButton]}>
              <Text style={styles.pillText}>Meus jogos</Text>
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

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.modeHeader}>
            <Text style={styles.section}>MODO</Text>
            <View style={styles.chips}>
              <Chip label="Quadra" selected={mode.group === 'quadra'} onPress={() => chooseGroup('quadra')} />
              <Chip label="Academia" selected={mode.group === 'academia'} onPress={() => chooseGroup('academia')} />
            </View>
          </View>
          <View style={styles.chips}>
            {modesIn(mode.group).map((m) => (
              <Chip key={m.id} label={m.label} selected={prefs.sport === m.id} onPress={() => update({ sport: m.id })} />
            ))}
          </View>

          <Text style={styles.section}>COMO SALVAR O LANCE</Text>
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
                title="Braços para cima"
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
              <TriggerTile icon={<WatchIcon />} title="Relógio" status="Em breve" disabled />
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

          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
          <Button
            label={opening ? 'Abrindo a câmera…' : 'Começar jogo'}
            icon={starting ? <ActivityIndicator color={colors.onAccent} /> : undefined}
            disabled={starting}
            onPress={() => session.start(prefs.sport)}
          />
        </SafeAreaView>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
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
