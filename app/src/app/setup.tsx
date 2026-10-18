import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReplayCameraView } from '../../modules/replay-camera';
import type { ReplayErrorCode } from '../../modules/replay-camera/src/ReplayCamera.types';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { CourtGuide } from '../components/CourtGuide';
import { RemoteIcon, TapIcon, WatchIcon, XArmsIcon } from '../components/icons';
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
  const { phase, error } = session.state;

  const update = (patch: Partial<Prefs>) => setPrefsState(repo.setPrefs(patch));

  // A press of the Bluetooth remote here proves it is paired and reaching the app.
  useVolumeRemote(phase === 'idle', () => setRemoteWorks(true));

  useEffect(() => {
    if (phase === 'recording') router.replace('/recording');
  }, [phase]);

  const starting = phase === 'starting';
  const errorText = error ? (START_ERRORS[error] ?? 'Não foi possível abrir a câmera. Tente de novo.') : null;

  return (
    <View style={styles.root}>
      <ReplayCameraView style={StyleSheet.absoluteFill} />
      <CourtGuide />

      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={styles.topRow}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Posicionar câmera</Text>
          </View>
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
            <Chip key={s.id} label={s.label} selected={prefs.sport === s.id} onPress={() => update({ sport: s.id })} />
          ))}
        </View>

        <Text style={styles.section}>COMO SALVAR O LANCE</Text>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <TriggerTile icon={<TapIcon />} title="Tela" status="Sempre ativa" />
            <TriggerTile
              icon={<XArmsIcon />}
              title="Gesto X"
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

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
        <Button label="Começar jogo" disabled={starting} onPress={() => session.start(prefs.sport)} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  top: { position: 'absolute', top: 0, left: 16, right: 16, gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  pill: { backgroundColor: 'rgba(15,16,13,0.75)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999 },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  lens: { flexDirection: 'row', backgroundColor: 'rgba(15,16,13,0.75)', borderRadius: 999, padding: 4, gap: 2 },
  lensButton: { minWidth: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  lensOn: { backgroundColor: colors.accent },
  lensText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  tip: { alignSelf: 'flex-start', backgroundColor: 'rgba(15,16,13,0.8)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
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
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  error: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
});
