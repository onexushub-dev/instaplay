import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { requestPermissions } from '../../modules/replay-camera';
import { Button } from '../components/Button';
import { PhoneIcon, ShareIcon, ShieldIcon, ArmsUpIcon } from '../components/icons';
import { repo } from '../data/mmkv';
import { BRAND_LOGO, logoAspect } from '../share/brandLogo';
import { colors, fonts } from '../theme/tokens';

const STEPS = [
  { Icon: PhoneIcon, text: 'Prenda o celular na grade ou na areia, atrás da linha de fundo.' },
  { Icon: ArmsUpIcon, text: 'Mandou bem? Acene com os dois braços no alto, toque no relógio ou no controle.' },
  { Icon: ShareIcon, text: 'Salve na galeria ou compartilhe com um toque.' },
];

export default function Onboarding() {
  const [denied, setDenied] = useState(false);

  async function allow() {
    if (await requestPermissions()) {
      repo.setPrefs({ onboardingDone: true });
      router.replace('/setup');
    } else {
      setDenied(true);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="Repplay" />

      <Text style={styles.title} accessibilityRole="header">
        GRAVE TUDO.{'\n'}
        <Text style={{ color: colors.accent }}>GUARDE SÓ O MELHOR.</Text>
      </Text>

      <View style={styles.steps}>
        {STEPS.map(({ Icon, text }) => (
          <View key={text} style={styles.step}>
            <Icon />
            <Text style={styles.stepText}>{text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.note}>
        <ShieldIcon />
        <Text style={styles.noteText}>
          Só os clipes que você salvar ficam no seu celular. O resto é apagado automaticamente.
        </Text>
      </View>

      <View style={styles.footer}>
        {denied ? (
          <>
            <Text style={styles.denied}>Sem câmera não dá para gravar os clipes. Libere em Ajustes.</Text>
            <Button label="Abrir Ajustes" variant="secondary" onPress={() => Linking.openSettings()} />
          </>
        ) : null}
        <Button label="Permitir câmera e começar" onPress={allow} />
        <Text style={styles.caption}>Sem cadastro. Grátis para começar.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 24, paddingTop: 24, gap: 28 },
  logo: { height: 30, aspectRatio: logoAspect(), alignSelf: 'flex-start' },
  title: { fontFamily: fonts.displayBold, fontSize: 46, lineHeight: 46, color: colors.text },
  steps: { gap: 14 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.text },
  note: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, padding: 14 },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.soft },
  footer: { marginTop: 'auto', gap: 10, paddingBottom: 16 },
  denied: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.warning, textAlign: 'center' },
  caption: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
