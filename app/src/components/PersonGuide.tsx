import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

/** Dashed standing silhouette: where the whole body should be in frame for gym modes. */
export function PersonGuide() {
  return (
    <View testID="guide-person" pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <Circle cx={50} cy={22} r={5} fill="none" stroke={colors.accent} strokeWidth={0.6} strokeDasharray="2 1.6" />
        <Path
          d="M50 28v26M50 32l-12 12M50 32l12 12M50 54l-8 24M50 54l8 24"
          fill="none"
          stroke={colors.accent}
          strokeWidth={0.6}
          strokeDasharray="2.5 2"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
