import { View } from 'react-native';

import { SPEEDS } from '../../share/editing';
import type { ToolContext } from '../tools';
import { Choice, PanelHead, panelStyles } from './PanelParts';

export function SpeedPanel({ ctx }: { ctx: ToolContext }) {
  return (
    <View style={{ gap: 10 }}>
      <PanelHead title="Velocidade" hint="Escolha a velocidade de reprodução do clipe." />
      <View style={panelStyles.row}>
        {SPEEDS.map((speed) => (
          <Choice
            key={speed}
            label={`${speed}x`}
            a11y={`Velocidade ${speed}x`}
            selected={ctx.edit.speed === speed}
            onPress={() => ctx.setEdit({ speed })}
          />
        ))}
      </View>
    </View>
  );
}
