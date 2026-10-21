import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { CheckIcon, RemoteIcon } from '../components/icons';
import { PulseRing } from '../components/PulseRing';
import { StatusPill } from '../components/StatusPill';
import { StepList } from '../components/StepList';
import { remoteDeviceView } from '../devices/remoteDevice';
import { setRemoteSheetOpen } from '../devices/remoteTest';
import { useRemoteTest } from '../devices/useRemoteTest';
import { colors, fonts, radius } from '../theme/tokens';

/** After this long without a press the sheet adds what to check. */
const WAITED_LONG_MS = 15_000;

const STEPS = [
  'Ligue o controle e deixe em modo de pareamento.',
  'Abra Ajustes > Bluetooth e toque no nome dele.',
  'Volte ao LANCE e aperte um botão do controle.',
];

const FORGET_HELP =
  'O LANCE deixa de mostrar este controle como pareado. Para desconectar de vez: Ajustes > Bluetooth > ⓘ ao lado do controle > Ignorar este dispositivo.';

/** The Bluetooth remote's side of the Dispositivos sheet: what to do to connect it, and proof when it works. */
export default function Devices() {
  const { pressed, testedBefore, forget } = useRemoteTest();
  const [waitedLong, setWaitedLong] = useState(false);

  // The remote presses "volume up". The setup screen under this sheet is the one listening (and keeps the camera and
  // the audio session as they were): two screens taking and handing back the volume buttons raced each other.
  useEffect(() => {
    setRemoteSheetOpen(true);
    return () => setRemoteSheetOpen(false);
  }, []);

  useEffect(() => {
    if (pressed) return;
    const id = setTimeout(() => setWaitedLong(true), WAITED_LONG_MS);
    return () => {
      clearTimeout(id);
      setWaitedLong(false);
    };
  }, [pressed]);

  const view = remoteDeviceView({ pressed, testedBefore, waitedLong });
  const remembered = pressed || testedBefore;

  const confirmForget = () =>
    Alert.alert('Esquecer o controle?', FORGET_HELP, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Esquecer', style: 'destructive', onPress: forget },
    ]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <RemoteIcon color={colors.accent} size={28} />
          <Text style={styles.title}>Controle Bluetooth</Text>
        </View>
        <StatusPill text={view.statusText} tone={view.state === 'connected' ? 'on' : 'idle'} />

        {view.state === 'connected' ? (
          <View style={styles.done}>
            <View style={styles.doneBadge}>
              <CheckIcon size={56} />
            </View>
            <Text style={styles.success}>Controle conectado</Text>
          </View>
        ) : null}

        {view.showSteps ? <StepList steps={STEPS} /> : null}

        {view.showWaiting ? (
          <View style={styles.waiting}>
            <PulseRing color={colors.accent} size={28} />
            <Text style={styles.waitingText}>Aperte um botão do controle…</Text>
          </View>
        ) : null}

        {view.showNote ? (
          <Text style={styles.note}>
            Nada ainda? Confira se o controle aparece como Conectado em Ajustes &gt; Bluetooth. Funciona com controles de
            selfie (tecla de volume).
          </Text>
        ) : null}

        {remembered ? (
          <View style={styles.row}>
            <Text style={styles.rowName}>Controle pareado</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Esquecer controle"
              hitSlop={8}
              onPress={confirmForget}
              style={styles.forget}>
              <Text style={styles.forgetText}>Esquecer</Text>
            </Pressable>
          </View>
        ) : null}

        <Button label="Pronto" variant={view.state === 'connected' ? 'primary' : 'secondary'} onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.text },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  waitingText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.accent },
  note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
  done: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  doneBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  success: { fontFamily: fonts.bodyBold, fontSize: 20, color: colors.accent, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    minHeight: 56,
  },
  rowName: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, flexShrink: 1 },
  forget: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  forgetText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning },
});
