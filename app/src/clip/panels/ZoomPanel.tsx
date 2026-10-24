import { Text, View } from 'react-native';

import { useT } from '../../i18n/useT';
import type { ToolContext } from '../tools';
import { Choice, PanelHead, panelStyles } from './PanelParts';

export function ZoomPanel({ ctx }: { ctx: ToolContext }) {
  const { t } = useT();
  const scale = ctx.edit.zoom ? ctx.edit.zoom.scale : 1;
  return (
    <View style={{ gap: 10 }}>
      <PanelHead
        title={t('clip.toolZoom')}
        hint={t('clip.zoomHint')}
        right={<Text style={panelStyles.value}>{`${scale.toFixed(1)}x`}</Text>}
      />
      {scale > 1 ? (
        <View style={{ flexDirection: 'row' }}>
          <Choice label={t('clip.zoomBack')} a11y={t('clip.resetZoom')} onPress={ctx.resetZoom} />
        </View>
      ) : null}
    </View>
  );
}
