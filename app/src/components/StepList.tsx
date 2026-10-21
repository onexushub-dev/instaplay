import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '../theme/tokens';

/** Numbered instructions, one per line. */
export function StepList({ steps }: { steps: string[] }) {
  return (
    <View style={styles.steps}>
      {steps.map((text, i) => (
        <View key={text} style={styles.step}>
          <View style={styles.number}>
            <Text style={styles.numberText}>{String(i + 1)}</Text>
          </View>
          <Text style={styles.text}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onAccent },
  text: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
});
