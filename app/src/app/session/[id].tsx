import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { ClipCard } from '../../components/ClipCard';
import { dayAndTime, megabytes, recordedLabel, sessionLabel, SPORT_LABEL } from '../../components/format';
import { repo } from '../../data/mmkv';
import { MAX_GAME_NAME } from '../../data/schema';
import { useSession } from '../../session/SessionContext';
import { colors, fonts } from '../../theme/tokens';

export default function SessionSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reset } = useSession();
  // Re-read whenever the repo changes (a clip deleted on the clip screen, a late save landing).
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const { session, clips, stats } = useMemo(
    () => ({ session: repo.getSession(id), clips: repo.listClips(id), stats: repo.sessionStats(id) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [id, version]
  );

  const [name, setName] = useState(() => session?.name ?? '');
  const saveName = () => {
    if (session && name.trim() !== (session.name ?? '')) repo.renameSession(id, name);
  };

  function newGame() {
    reset();
    router.replace('/setup');
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        {session ? (
          <Text style={styles.subtitle}>{`${SPORT_LABEL[session.sport]} · ${dayAndTime(session.startedAt)}`}</Text>
        ) : null}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {session?.name ? sessionLabel(session) : 'FIM DE JOGO'}
        </Text>
        {session ? (
          <View style={styles.nameBox}>
            <TextInput
              accessibilityLabel="Nome do jogo"
              value={name}
              onChangeText={setName}
              onSubmitEditing={saveName}
              onBlur={saveName}
              placeholder={sessionLabel({ ...session, name: undefined })}
              placeholderTextColor={colors.muted}
              maxLength={MAX_GAME_NAME}
              returnKeyType="done"
              style={styles.nameInput}
            />
            <Text style={styles.nameCaption}>Opcional. Ajuda a achar o jogo depois.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat value={recordedLabel(stats.recordedMs)} label="gravadas" />
        <Stat value={String(stats.clips)} label="lances" accent />
        <Stat value={megabytes(stats.bytes)} label="guardados" />
      </View>
      <Text style={styles.note}>O restante do jogo já foi apagado do celular.</Text>

      <FlatList
        data={clips}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum lance salvo neste jogo.</Text>}
        renderItem={({ item, index }) => (
          <ClipCard clip={item} number={index + 1} onPress={() => router.push(`/clip/${item.id}`)} />
        )}
      />

      <View style={styles.footer}>
        <Text style={styles.caption}>Editor e Story chegam na próxima versão.</Text>
        <View style={styles.buttons}>
          <View style={{ flex: 1 }}>
            <Button label="Novo jogo" variant="secondary" onPress={newGame} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button label="Postar um lance" onPress={() => {}} disabled />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && { color: colors.accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 16 },
  header: { gap: 4, marginTop: 16 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.displayBold, fontSize: 44, color: colors.text },
  nameBox: { gap: 4, marginTop: 4 },
  nameInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    color: colors.text,
  },
  nameCaption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 2 },
  statValue: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.text },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: -8 },
  grid: { gap: 10, paddingBottom: 12 },
  gridRow: { gap: 10 },
  empty: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
  footer: { gap: 8, paddingBottom: 12 },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10 },
});
