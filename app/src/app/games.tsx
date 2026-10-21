import { router } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { GameCard } from '../components/GameCard';
import { BackIcon } from '../components/icons';
import { sessionLabel } from '../components/format';
import { removeFile, repo } from '../data/mmkv';
import { useT } from '../i18n/useT';
import { payments } from '../payments';
import { restorePurchases } from '../payments/feedback';
import { useSession } from '../session/SessionContext';
import { colors, fonts } from '../theme/tokens';

/** Past games with at least one lance, newest first. */
export default function Games() {
  const { t, locale } = useT();
  const { reset, state } = useSession();
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const paymentsVersion = useSyncExternalStore(payments.subscribe, payments.version);
  const games = useMemo(
    () =>
      repo.listSessions().map((g) => ({
        ...g,
        recordedMs: repo.sessionStats(g.session.id).recordedMs,
        lockedClips: payments.tierFor(g.session.id) === 'free' ? repo.lockedCount(g.session.id) : 0,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- versions are the change signals
    [version, paymentsVersion],
  );

  // A game still being recorded has no end yet: it is never offered for deleting.
  const confirmDelete = (id: string, label: string, clips: number) => {
    Alert.alert(
      t('games.deleteTitle', { name: label }),
      t('games.deleteBody', { count: clips }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => repo.deleteSession(id).forEach((path) => removeFile(path)),
        },
      ],
    );
  };

  // The setup screen is already under this one. A game that has just ended still holds the live session, so start clean.
  const newGame = () => {
    if (state.phase === 'ended') reset();
    router.dismissTo('/setup');
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          style={styles.back}>
          <BackIcon />
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t('games.title')}
      </Text>
      <FlatList
        data={games}
        keyExtractor={(g) => g.session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('games.empty')}</Text>}
        renderItem={({ item }) => {
          const ended = item.session.endedAt !== undefined;
          const ask = () => confirmDelete(item.session.id, sessionLabel(item.session, undefined, locale), item.clips);
          return (
            <GameCard
              session={item.session}
              clips={item.clips}
              firstClip={item.firstClip}
              recordedMs={item.recordedMs}
              lockedClips={item.lockedClips}
              onPress={() => router.push(`/session/${item.session.id}`)}
              onLongPress={ended ? ask : undefined}
              onDelete={ended ? ask : undefined}
            />
          );
        }}
      />
      <View style={styles.footer}>
        <Button label={t('summary.newRecording')} onPress={newGame} />
        <Button label={t('games.restore')} variant="secondary" onPress={() => void restorePurchases(t)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 12 },
  top: { flexDirection: 'row', marginTop: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.displayBold, fontSize: 44, color: colors.text },
  list: { gap: 10, paddingBottom: 24 },
  footer: { paddingBottom: 12, gap: 10 },
  empty: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
