import { Text, View } from 'react-native';

import type { ToolContext } from '../tools';
import { Choice, PanelHead, panelStyles } from './PanelParts';

export function ZoomPanel({ ctx }: { ctx: ToolContext }) {
  const scale = ctx.edit.zoom ? ctx.edit.zoom.scale : 1;
  return (
    <View style={{ gap: 10 }}>
      <PanelHead
        title="Zoom"
        hint="Pince o vídeo para aproximar. Com zoom manual o Modo Foco desliga."
        right={<Text style={panelStyles.value}>{`${scale.toFixed(1)}x`}</Text>}
      />
      {scale > 1 ? (
        <View style={{ flexDirection: 'row' }}>
          <Choice label="Voltar a 1x" a11y="Voltar zoom para 1x" onPress={ctx.resetZoom} />
        </View>
      ) : null}
    </View>
  );
}
