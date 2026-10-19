import { router } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameCard } from '../components/GameCard';
import { BackIcon } from '../components/icons';
import { repo } from '../data/mmkv';
import { colors, fonts } from '../theme/tokens';

/** Past games with at least one lance, newest first. */
export default function Games() {
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const games = useMemo(
    () => repo.listSessions().map((g) => ({ ...g, recordedMs: repo.sessionStats(g.session.id).recordedMs })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [version]
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <BackIcon />
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        MEUS JOGOS
      </Text>
      <FlatList
        data={games}
        keyExtractor={(g) => g.session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma gravação com clipes ainda.</Text>}
        renderItem={({ item }) => (
          <GameCard
            session={item.session}
            clips={item.clips}
            firstClip={item.firstClip}
            recordedMs={item.recordedMs}
            onPress={() => router.push(`/session/${item.session.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 12 },
  top: { flexDirection: 'row', marginTop: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.displayBold, fontSize: 44, color: colors.text },
  list: { gap: 10, paddingBottom: 24 },
  empty: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
