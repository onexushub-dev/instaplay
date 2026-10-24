import { View } from 'react-native';

import type { ToolContext } from '../tools';
import { Choice, PanelHead } from './PanelParts';

export function RotatePanel({ ctx }: { ctx: ToolContext }) {
  return (
    <View style={{ gap: 10 }}>
      <PanelHead title="Girar" hint="Para um vídeo gravado de lado." />
      <View style={{ flexDirection: 'row' }}>
        <Choice label="Girar 90°" a11y="Girar vídeo" onPress={ctx.turn} />
      </View>
    </View>
  );
}
