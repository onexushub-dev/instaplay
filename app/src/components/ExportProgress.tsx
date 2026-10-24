import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { type AppLocale, currentLocale, translate } from '../i18n';
import { useT } from '../i18n/useT';
import { colors, fonts, radius } from '../theme/tokens';

export type ExportJob = { kind: 'save' | 'share'; stage: 'preparing' | 'delivering' };

export function exportTitle(job: ExportJob, locale: AppLocale = currentLocale()): string {
  if (job.stage === 'preparing') return translate(locale, 'clip.exportPreparing');
  return translate(locale, job.kind === 'save' ? 'clip.exportSaving' : 'clip.exportSharing');
}

type Props = { job: ExportJob };

/** A card over the clip while its video is made and handed over. */
export function ExportProgress({ job }: Props) {
  const { locale } = useT();
  const title = exportTitle(job, locale);
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View accessibilityRole="progressbar" accessibilityLabel={title} style={styles.card}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.title}>{title}</Text>
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
