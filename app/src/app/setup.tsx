import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isVoiceSupported, ReplayCameraView, requestSpeechPermission } from '../../modules/replay-camera';
import type { ReplayErrorCode } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { CourtGuide } from '../components/CourtGuide';
import { RecordingPanel } from '../components/RecordingPanel';
import { ArmsUpIcon, MicIcon, RemoteIcon, WatchIcon } from '../components/icons';
import { TriggerTile } from '../components/TriggerTile';
import { repo } from '../data/mmkv';
import type { Prefs, Sport } from '../data/schema';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';
import { useVolumeRemote } from '../triggers/useVolumeRemote';

const SPORTS: { id: Sport; label: string }[] = [
  { id: 'beachTennis', label: 'Beach tennis' },
  { id: 'futevolei', label: 'Futevôlei' },
  { id: 'voleiPraia', label: 'Vôlei de praia' },
  { id: 'outro', label: 'Outro' },
];

const START_ERRORS: Partial<Record<ReplayErrorCode, string>> = {
  LOW_STORAGE: 'Pouco espaço no celular. Libere pelo menos 500 MB para gravar.',
  CAMERA_PERMISSION: 'Sem câmera não dá para gravar os lances. Libere em Ajustes.',
};

export default function Setup() {
  useKeepAwake();
  const session = useSession();
  const [prefs, setPrefsState] = useState<Prefs>(() => repo.getPrefs());
  const [remoteWorks, setRemoteWorks] = useState(false);
  const [speechDenied, setSpeechDenied] = useState(false);
  // Offline recognition only: court audio is never streamed to a server.
  const [voiceSupported] = useState(() => isVoiceSupported());

  async function toggleVoice() {
    if (prefs.voiceEnabled) return update({ voiceEnabled: false });
    const granted = await requestSpeechPermission();
    setSpeechDenied(!granted);
    if (granted) update({ voiceEnabled: true });
  }
  const { phase, error, camera } = session.state;
  const { prepare } = session;

  // Live preview while positioning; the buffer starts filling now, so "Começar jogo" is instant.
  useEffect(() => {
    void prepare(prefs.lens);
  }, [prepare, prefs.lens]);

  const update = (patch: Partial<Prefs>) => setPrefsState(repo.setPrefs(patch));

  // A press of the Bluetooth remote here proves it is paired and reaching the app.
  useVolumeRemote(phase === 'idle', () => setRemoteWorks(true));

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
        <CourtGuide />

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
                  accessibilityState={{ selected: prefs.lens === lens }}
                  onPress={() => update({ lens })}
                  style={[styles.lensButton, prefs.lens === lens && styles.lensOn]}>
                  <Text style={[styles.lensText, prefs.lens === lens && { color: colors.onAccent }]}>
                    {lens === 'ultraWide' ? '0.5x' : '1x'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.tip}>
            <Text style={styles.tipText}>Atrás da linha de fundo, na altura do ombro</Text>
          </View>
        </SafeAreaView>

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.section}>ESPORTE</Text>
          <View style={styles.chips}>
            {SPORTS.map((s) => (
              <Chip
                key={s.id}
                label={s.label}
                selected={prefs.sport === s.id}
                onPress={() => update({ sport: s.id })}
              />
            ))}
          </View>

          <Text style={styles.section}>COMO SALVAR O LANCE</Text>
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <TriggerTile
                icon={<MicIcon />}
                title="Voz"
                status={!voiceSupported ? 'Indisponível neste celular' : prefs.voiceEnabled ? 'Diga “salvar” ou “gravar”' : 'Desligado'}
                active={voiceSupported && prefs.voiceEnabled}
                disabled={!voiceSupported}
                onPress={voiceSupported ? () => void toggleVoice() : undefined}
              />
              <TriggerTile
                icon={<ArmsUpIcon />}
                title="Braços para cima"
                status={prefs.gestureEnabled ? 'Ativo' : 'Desligado'}
                active={prefs.gestureEnabled}
                onPress={() => update({ gestureEnabled: !prefs.gestureEnabled })}
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
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
