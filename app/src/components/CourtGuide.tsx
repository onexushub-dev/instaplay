import { StyleSheet, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { colors } from '../theme/tokens';

/** Dashed outline where the court should sit in the frame: far baseline narrow, near baseline wide. */
export function CourtGuide() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Polygon
          points="23,30 77,30 99,92 1,92"
          fill="none"
          stroke={colors.accent}
          strokeWidth={0.6}
          strokeDasharray="2.5 2"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}
