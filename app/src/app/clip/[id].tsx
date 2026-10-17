import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { BackIcon } from '../../components/icons';
import { SOURCE_LABEL } from '../../components/sourceLabel';
import { removeFile, repo } from '../../data/mmkv';
import { colors, fonts } from '../../theme/tokens';

/** Plays a saved lance, looping its cut (last 30s by default). The editor comes in Plan 3. */
export default function ClipPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clip = repo.getClip(id);
  const start = (clip?.trim.startMs ?? 0) / 1000;
  const end = (clip?.trim.endMs ?? 0) / 1000;

  const player = useVideoPlayer(clip ? { uri: `file://${clip.path}` } : null, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.currentTime = start;
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime >= end) player.currentTime = start;
    });
    return () => sub.remove();
  }, [player, start, end]);

  function confirmDelete() {
    if (!clip) return;
    Alert.alert('Apagar este lance?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          removeFile(clip.path);
          repo.deleteClip(clip.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <BackIcon />
        </Pressable>
        {clip ? <Text style={styles.title}>{`Lance · ${SOURCE_LABEL[clip.source]}`}</Text> : null}
        <View style={styles.back} />
      </View>
      <View style={styles.video}>
        {clip ? (
          <VideoView player={player} contentFit="contain" nativeControls={false} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={styles.missing}>Este lance não está mais no celular.</Text>
        )}
      </View>
      {clip ? <Button label="Apagar lance" variant="secondary" onPress={confirmDelete} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 16, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  video: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'center' },
  missing: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center' },
});
