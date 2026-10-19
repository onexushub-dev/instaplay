import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

/** Viewfinder corners where the whole body should fit, over a dashed floor line (gym modes). */
export function PersonGuide() {
  const corner = { fill: 'none', stroke: colors.accent, strokeWidth: 0.9, strokeLinecap: 'round' as const };
  return (
    <View testID="guide-person" pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 60 100" preserveAspectRatio="xMidYMid meet">
        <Path d="M12 18v-7h7" {...corner} />
        <Path d="M48 18v-7h-7" {...corner} />
        <Path d="M12 76v7h7" {...corner} />
        <Path d="M48 76v7h-7" {...corner} />
        <Line x1={4} y1={88} x2={56} y2={88} stroke={colors.accent} strokeWidth={0.6} strokeDasharray="2.5 2" />
      </Svg>
    </View>
  );
}
