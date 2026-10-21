import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '../theme/tokens';

export type ExportJob = { kind: 'save' | 'share'; stage: 'preparing' | 'delivering' };

export function exportTitle(job: ExportJob): string {
  if (job.stage === 'preparing') return 'Preparando o vídeo…';
  return job.kind === 'save' ? 'Salvando na galeria…' : 'Abrindo o compartilhamento…';
}

type Props = { job: ExportJob };

/** A card over the clip while its video is made and handed over. */
export function ExportProgress({ job }: Props) {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View accessibilityRole="progressbar" accessibilityLabel={exportTitle(job)} style={styles.card}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.title}>{exportTitle(job)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  card: {
    minWidth: 240,
    maxWidth: 320,
    alignItems: 'center',
    gap: 8,
    padding: 24,
    borderRadius: radius.card,
    backgroundColor: 'rgba(15,16,13,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text, textAlign: 'center', marginTop: 4 },
});
