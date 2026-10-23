import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

/** What both phones need for the link to work. Shown wherever pairing can fail, so nobody has to guess. */
export const REQUIREMENTS: string[] = [
  'Bluetooth ligado nos dois celulares. Não precisa de internet nem de rede Wi-Fi.',
  'Repplay aberto nos dois celulares, perto um do outro.',
  'Para ver a câmera no controle: Wi-Fi ligado e Rede Local liberada para o Repplay em Ajustes.',
];

/** The things to check when the phones do not find each other (the last one only matters for the camera preview). */
export function RequirementsChecklist({ title = 'Para conectar, confira:' }: { title?: string }) {
  return (
    <View accessible accessibilityLabel={`${title} ${REQUIREMENTS.join(' ')}`} style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {REQUIREMENTS.map((line) => (
        <View key={line} style={styles.row}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.text}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, backgroundColor: colors.surface, borderRadius: radius.card, padding: 14 },
  title: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.4, color: colors.soft },
  row: { flexDirection: 'row', gap: 8 },
  bullet: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.muted },
  text: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.soft },
});
