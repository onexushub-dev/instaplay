import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { ClipCard } from '../../components/ClipCard';
import { dayAndTime, megabytes, recordedLabel, sessionLabel, SPORT_LABEL } from '../../components/format';
import { removeFile, repo } from '../../data/mmkv';
import { MAX_GAME_NAME } from '../../data/schema';
import { useSession } from '../../session/SessionContext';
import { colors, fonts } from '../../theme/tokens';

export default function SessionSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { reset, state } = useSession();
  // Re-read whenever the repo changes (a clip deleted on the clip screen, a late save landing).
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  const { session, clips, stats } = useMemo(
    () => ({ session: repo.getSession(id), clips: repo.listClips(id), stats: repo.sessionStats(id) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [id, version],
  );

  const [name, setName] = useState(() => session?.name ?? '');
  const saveName = () => {
    if (session && name.trim() !== (session.name ?? '')) repo.renameSession(id, name);
  };

  // Picking clips to delete.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const stopSelecting = () => {
    setSelecting(false);
    setPicked([]);
  };
  const toggle = (clipId: string) =>
    setPicked((current) => (current.includes(clipId) ? current.filter((c) => c !== clipId) : [...current, clipId]));
  const pickAll = () => setPicked(picked.length === clips.length ? [] : clips.map((c) => c.id));

  function confirmDeleteClips() {
    const count = picked.length;
    Alert.alert(count === 1 ? 'Apagar 1 clipe?' : `Apagar ${count} clipes?`, 'Não dá para desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          for (const clip of clips) {
            if (!picked.includes(clip.id)) continue;
            removeFile(clip.path);
            repo.deleteClip(clip.id);
          }
          stopSelecting();
        },
      },
    ]);
  }

  function confirmDeleteGame() {
    const count = clips.length;
    Alert.alert(
      'Apagar esta gravação?',
      count === 0
        ? 'A gravação será removida da lista.'
        : `${count === 1 ? 'O clipe' : `Os ${count} clipes`} dela será${count === 1 ? '' : 'o'} apagado${count === 1 ? '' : 's'} do celular. Não dá para desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            repo.deleteSession(id).forEach((path) => removeFile(path));
            if (state.sessionId === id) reset();
            router.dismissTo('/games');
          },
        },
      ],
    );
  }

  function newGame() {
    // Only the game that just ended resets the live session; from Minhas gravações, setup is already under us.
    if (state.sessionId === id) reset();
    router.dismissTo('/setup');
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        {session ? (
          <Text style={styles.subtitle}>{`${SPORT_LABEL[session.sport]} · ${dayAndTime(session.startedAt)}`}</Text>
        ) : null}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {session?.name ? sessionLabel(session) : 'GRAVAÇÃO ENCERRADA'}
        </Text>
        {session ? (
          <View style={styles.nameBox}>
            <TextInput
              accessibilityLabel="Nome da gravação"
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
            <Text style={styles.nameCaption}>Opcional. Ajuda a achar a gravação depois.</Text>
          </View>
        ) : null}
      </View>

      {clips.length > 0 ? (
        <View style={styles.pickBar}>
          {selecting ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancelar seleção"
                hitSlop={8}
                onPress={stopSelecting}>
                <Text style={styles.pickLink}>Cancelar</Text>
              </Pressable>
              <Text style={styles.pickCount}>
                {picked.length === 0
                  ? 'Toque nos clipes'
                  : `${picked.length} ${picked.length === 1 ? 'selecionado' : 'selecionados'}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={picked.length === clips.length ? 'Limpar seleção' : 'Selecionar todos'}
                hitSlop={8}
                onPress={pickAll}>
                <Text style={styles.pickLink}>{picked.length === clips.length ? 'Limpar' : 'Todos'}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Selecionar clipes"
              hitSlop={8}
              onPress={() => setSelecting(true)}>
              <Text style={styles.pickLink}>Selecionar clipes</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat value={recordedLabel(stats.recordedMs)} label="gravadas" />
        <Stat value={String(stats.clips)} label="clipes" accent />
        <Stat value={megabytes(stats.bytes)} label="guardados" />
      </View>
      <Text style={styles.note}>O restante da gravação já foi apagado do celular.</Text>

      <FlatList
        data={clips}
        keyExtractor={(c) => c.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum clipe salvo nesta gravação.</Text>}
        extraData={[selecting, picked]}
        renderItem={({ item, index }) => (
          <ClipCard
            clip={item}
            number={index + 1}
            selecting={selecting}
            selected={picked.includes(item.id)}
            onPress={() => (selecting ? toggle(item.id) : router.push(`/clip/${item.id}`))}
            onLongPress={
              selecting
                ? undefined
                : () => {
                    setSelecting(true);
                    setPicked([item.id]);
                  }
            }
          />
        )}
      />

      <View style={styles.footer}>
        {selecting ? (
          <Button
            label={
              picked.length === 0 ? 'Apagar' : `Apagar ${picked.length} ${picked.length === 1 ? 'clipe' : 'clipes'}`
            }
            variant="danger"
            disabled={picked.length === 0}
            onPress={confirmDeleteClips}
          />
        ) : (
          <>
            <Button label="Nova gravação" variant="secondary" onPress={newGame} />
            {session ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Apagar gravação"
                hitSlop={8}
                onPress={confirmDeleteGame}
                style={styles.deleteGame}>
                <Text style={styles.deleteGameText}>Apagar gravação</Text>
              </Pressable>
            ) : null}
          </>
        )}
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
  pickBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  pickLink: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accent },
  pickCount: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
  deleteGame: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteGameText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.rec },
  buttons: { flexDirection: 'row', gap: 10 },
});
