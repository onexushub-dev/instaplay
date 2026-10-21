import { Pressable, StyleSheet, Text } from 'react-native';

import { formatZoom } from '../modes/zoom';
import { colors, fonts } from '../theme/tokens';

type Props = { value: number; onPress: () => void };

/** The camera's zoom, as one round button: it shows only the current value and each tap goes to the next stop. */
export function ZoomButton({ value, onPress }: Props) {
  const text = formatZoom(value);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Zoom ${text}`}
      accessibilityHint="Toque para mudar o zoom"
      onPress={onPress}
      style={styles.button}>
      <Text style={styles.text}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onAccent },
});
