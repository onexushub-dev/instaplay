import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { seconds, timeOfDay } from '../../components/format';
import { BackIcon } from '../../components/icons';
import { TrimBar } from '../../components/TrimBar';
import { removeFile, repo } from '../../data/mmkv';
import type { Clip } from '../../data/schema';
import { colors, fonts } from '../../theme/tokens';

const NO_EDIT: NonNullable<Clip['edit']> = { slowmo: false, muted: false };

type Player = ReturnType<typeof useVideoPlayer>;

/** Player settings live outside the component: the React Compiler forbids mutating a hook's return value. */
function applyPlayback(player: Player, slowmo: boolean, muted: boolean) {
  player.playbackRate = slowmo ? 0.5 : 1;
  player.muted = muted || slowmo;
}

function seek(player: Player, ms: number) {
  player.currentTime = ms / 1000;
}

/** Edit a saved lance: the cut inside its 60s, slow motion and sound. Then on to the Story. */
export default function ClipEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
  const clip = useMemo(() => repo.getClip(id), [id, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
  const number = useMemo(() => (clip ? repo.listClips(clip.sessionId).findIndex((c) => c.id === id) + 1 : 0), [clip, id, version]);
  const [trim, setTrim] = useState(() => clip?.trim ?? { startMs: 0, endMs: 0 });
  const edit = clip?.edit ?? NO_EDIT;

  const player = useVideoPlayer(clip ? { uri: `file://${clip.path}` } : null, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.currentTime = trim.startMs / 1000;
    p.play();
  });

  // Loop the cut; follow slow motion and sound live.
  useEffect(() => {
    applyPlayback(player, edit.slowmo, edit.muted);
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime >= trim.endMs / 1000 || currentTime < trim.startMs / 1000 - 0.5) seek(player, trim.startMs);
    });
    return () => sub.remove();
  }, [player, trim, edit.slowmo, edit.muted]);

  if (!clip) {
    return (
      <SafeAreaView style={styles.root}>
        <BackButton />
        <Text style={styles.missing}>Este lance não está mais no celular.</Text>
      </SafeAreaView>
    );
  }

  const setEdit = (patch: Partial<NonNullable<Clip['edit']>>) => repo.updateClip(id, { edit: { ...edit, ...patch } });

  function confirmDelete() {
    Alert.alert('Apagar este lance?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          removeFile(clip!.path);
          repo.deleteClip(id);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <BackButton />
        <Text style={styles.title}>{`Lance #${number} · ${timeOfDay(clip.createdAt)}`}</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.video}>
        <VideoView player={player} contentFit="contain" nativeControls={false} style={StyleSheet.absoluteFill} />
        {edit.slowmo ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>0.5x câmera lenta</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.trim}>
        <View style={styles.trimLabels}>
          <Text style={styles.small}>{`-${seconds(clip.durationMs)}`}</Text>
          <Text style={styles.cut}>{`Corte: ${seconds(trim.endMs - trim.startMs)}`}</Text>
          <Text style={styles.small}>gatilho</Text>
        </View>
        <TrimBar
          durationMs={clip.durationMs}
          trim={trim}
          onChange={setTrim}
          onCommit={(t) => repo.updateClip(id, { trim: t })}
        />
        <Text style={styles.small}>Arraste as bordas para ajustar o corte dentro dos 60s.</Text>
      </View>

      <View style={styles.tools}>
        <Tool label="Corte" active />
        <Tool label="Câmera lenta" active={edit.slowmo} onPress={() => setEdit({ slowmo: !edit.slowmo })} />
        <Tool label={edit.muted ? 'Sem som' : 'Som'} a11y="Som" active={!edit.muted} onPress={() => setEdit({ muted: !edit.muted })} />
      </View>

      <View style={styles.actions}>
        <Button label="Próximo: Story" onPress={() => router.push(`/story/${id}`)} />
        <Button label="Apagar lance" variant="secondary" onPress={confirmDelete} />
      </View>
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
      <BackIcon />
    </Pressable>
  );
}

function Tool({ label, a11y, active, onPress }: { label: string; a11y?: string; active: boolean; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: active }}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.tool, active && styles.toolOn]}>
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 14, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  spacer: { width: 44 },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  video: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface },
  badge: { position: 'absolute', left: 12, top: 12, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onAccent },
  trim: { gap: 8 },
  trimLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  cut: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  tools: { flexDirection: 'row', gap: 8 },
  tool: { flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  toolOn: { borderWidth: 2, borderColor: colors.accent },
  toolText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  actions: { gap: 10 },
  missing: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
