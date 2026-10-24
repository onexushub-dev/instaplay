import { StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';

/** What both phones need for the link to work. Shown wherever pairing can fail, so nobody has to guess. */
const REQUIREMENT_KEYS = ['requirements.bluetooth', 'requirements.appsOpen', 'requirements.preview'] as const;

/** The things to check when the phones do not find each other (the last one only matters for the camera preview). */
export function RequirementsChecklist({ title }: { title?: string }) {
  const { t } = useT();
  const heading = title === undefined ? t('requirements.title') : title;
  const lines = REQUIREMENT_KEYS.map((key) => t(key));
  return (
    <View accessible accessibilityLabel={`${heading} ${lines.join(' ')}`} style={styles.box}>
      <Text style={styles.title}>{heading}</Text>
      {lines.map((line) => (
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
