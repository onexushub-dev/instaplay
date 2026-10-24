import { Text, View } from 'react-native';

import type { ToolContext } from '../tools';
import { Choice, PanelHead, panelStyles } from './PanelParts';

export function SoundPanel({ ctx }: { ctx: ToolContext }) {
  const locked = ctx.edit.speed !== 1;
  const on = !ctx.edit.muted && !locked;
  return (
    <View style={{ gap: 10 }}>
      <PanelHead title="Som" hint="Ative ou desative o som do clipe." />
      <View style={panelStyles.row}>
        <Choice
          label={on ? 'Com som' : 'Sem som'}
          a11y="Som"
          selected={on}
          disabled={locked}
          onPress={locked ? undefined : () => ctx.setEdit({ muted: !ctx.edit.muted })}
        />
      </View>
      {locked ? <Text style={panelStyles.note}>Fora de 1x o vídeo sai sem som.</Text> : null}
    </View>
  );
}
