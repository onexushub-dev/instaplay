import { router } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameCard } from '../components/GameCard';
import { BackIcon } from '../components/icons';
import { removeFile, repo } from '../data/mmkv';
import { sessionLabel } from '../components/format';
import { colors, fonts } from '../theme/tokens';

/** Past games with at least one lance, newest first. */
export default function Games() {
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const games = useMemo(
    () => repo.listSessions().map((g) => ({ ...g, recordedMs: repo.sessionStats(g.session.id).recordedMs })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [version],
  );

  // A game still being recorded has no end yet: it is never offered for deleting.
  const confirmDelete = (id: string, label: string, clips: number) => {
    Alert.alert(
      `Apagar “${label}”?`,
      `${clips === 1 ? 'O clipe dessa gravação será apagado' : `Os ${clips} clipes dessa gravação serão apagados`} do celular. Não dá para desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => repo.deleteSession(id).forEach((path) => removeFile(path)),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          style={styles.back}>
          <BackIcon />
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        MINHAS GRAVAÇÕES
      </Text>
      <FlatList
        data={games}
        keyExtractor={(g) => g.session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhuma gravação com clipes ainda.</Text>}
        renderItem={({ item }) => {
          const ended = item.session.endedAt !== undefined;
          const ask = () => confirmDelete(item.session.id, sessionLabel(item.session), item.clips);
          const card = (
            <GameCard
              session={item.session}
              clips={item.clips}
              firstClip={item.firstClip}
              recordedMs={item.recordedMs}
              onPress={() => router.push(`/session/${item.session.id}`)}
              onLongPress={ended ? ask : undefined}
              onDelete={ended ? ask : undefined}
            />
          );
          return card;
        }}
      />
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
  empty: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
