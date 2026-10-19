import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createThumbnail, exportClip } from '../../../modules/replay-camera';
import { Button } from '../../components/Button';
import { BackIcon } from '../../components/icons';
import { repo } from '../../data/mmkv';
import { captureOverlay } from '../../share/captureOverlay';
import { useEntitlement } from '../../share/entitlement';
import { exportOptions } from '../../share/exportOptions';
import { frameLayout } from '../../share/layout';
import { ShareOverlay } from '../../share/ShareOverlay';
import { colors, fonts } from '../../theme/tokens';

const PREPARE_FAILED = 'Não foi possível preparar o vídeo. Tente de novo.';

type Player = ReturnType<typeof useVideoPlayer>;
/** Player settings live outside the component: the React Compiler forbids mutating a hook's return value. */
function loopFrom(player: Player, ms: number) {
  player.currentTime = ms / 1000;
}

function setRate(player: Player, slowmo: boolean) {
  player.playbackRate = slowmo ? 0.5 : 1;
}

function removeQuietly(path: string) {
  try {
    new File(`file://${path}`).delete();
  } catch {
    // already gone
  }
}

/** Exports left by a crash or a kill would otherwise pile up in the cache. */
function clearOldExports() {
  try {
    new Directory(Paths.cache, 'exports').list().forEach((item) => item.delete());
  } catch {
    // no exports dir yet
  }
}

/** Preview of the exported clip (whole video in a 9:16 frame, with the app mark); save to Photos or share. */
export default function ShareScreen() {
  const { clipId } = useLocalSearchParams<{ clipId: string }>();
  const clip = useMemo(() => repo.getClip(clipId), [clipId]);
  const session = useMemo(() => (clip ? repo.getSession(clip.sessionId) : undefined), [clip]);
  const { tier } = useEntitlement();
  const [videoSize, setVideoSize] = useState({ width: 1920, height: 1080 });
  // Exports wait for the real shape: a portrait clip exported with the landscape default gets wrong bands.
  const [sizeKnown, setSizeKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const exporting = useRef(false);
  const exported = useRef<{ key: string; path: string } | undefined>(undefined);
  const made = useRef<string[]>([]);
  const captureRefView = useRef<ComponentRef<typeof View>>(null);
  const window = useWindowDimensions();

  const options = clip ? exportOptions(tier, clip.edit, clip.trim) : undefined;
  const frame = { width: options?.width ?? 1080, height: options?.height ?? 1920 };
  const layout = frameLayout(videoSize, frame);
  // The real aspect ratio (rotation applied) comes from the clip's thumbnail.
  useEffect(() => {
    if (!clip) return;
    createThumbnail(clip.path, clip.trim.startMs)
      .then((path) => Image.getSize(`file://${path}`))
      .then(({ width, height }) => setVideoSize({ width, height }))
      .catch(() => {}) // keep the default shape
      .finally(() => setSizeKnown(true));
  }, [clip]);

  // Exports are temporary: Photos and Instagram keep their own copies.
  const mounted = useRef(true);
  useEffect(() => {
    clearOldExports();
    mounted.current = true;
    const files = made.current;
    return () => {
      mounted.current = false;
      files.forEach(removeQuietly);
    };
  }, []);

  const player = useVideoPlayer(clip ? { uri: `file://${clip.path}` } : null, (p) => {
    p.timeUpdateEventInterval = 0.25;
    p.muted = true;
    p.currentTime = (clip?.trim.startMs ?? 0) / 1000;
    p.play();
  });
  useEffect(() => setRate(player, clip?.edit?.slowmo ?? false), [player, clip]);
  useEffect(() => {
    if (!clip) return;
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime >= clip.trim.endMs / 1000) loopFrom(player, clip.trim.startMs);
    });
    return () => sub.remove();
  }, [player, clip]);

  /** One export per look (cut, edits, frame), reused by both buttons. */
  async function ensureExport(): Promise<string> {
    const key = JSON.stringify([options, layout]);
    if (exported.current?.key === key) return exported.current.path;
    const overlayPngPath = await captureOverlay(captureRefView);
    const result = await exportClip({ clipPath: clip!.path, ...options!, overlayPngPath, background: colors.ground });
    removeQuietly(overlayPngPath);
    if (!mounted.current) {
      removeQuietly(result.path); // the screen closed during the export
      throw new Error('closed');
    }
    made.current.push(result.path);
    exported.current = { key, path: result.path };
    return result.path;
  }

  async function run(action: (path: string) => Promise<void>) {
    if (exporting.current || !clip || !sizeKnown) return;
    exporting.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      await action(await ensureExport());
    } catch {
      setNotice(PREPARE_FAILED);
    } finally {
      exporting.current = false;
      setBusy(false);
    }
  }

  const save = () =>
    run(async (path) => {
      const { granted } = await requestPermissionsAsync(true, ['video']);
      if (!granted) return setNotice('Sem acesso às fotos. Libere em Ajustes.');
      await Asset.create(`file://${path}`);
      setNotice('Salvo na galeria.');
    });

  const share = () => run((path) => shareAsync(`file://${path}`, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' }));

  if (!clip || !session || !options) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.notice}>Este clipe não está mais no celular.</Text>
      </SafeAreaView>
    );
  }

  // Preview: as large as fits above the controls.
  const previewHeight = Math.min(window.height * 0.5, ((window.width - 40) * frame.height) / frame.width);
  const scale = previewHeight / frame.height;
  const pr = PixelRatio.get();

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
        <Text style={styles.title}>Salvar clipe</Text>
        <View style={styles.back} />
      </View>

      <View style={[styles.preview, { width: frame.width * scale, height: previewHeight }]}>
        <View
          style={{
            position: 'absolute',
            left: layout.video.x * scale,
            top: layout.video.y * scale,
            width: layout.video.width * scale,
            height: layout.video.height * scale,
          }}>
          <VideoView player={player} contentFit="contain" nativeControls={false} style={StyleSheet.absoluteFill} />
        </View>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <ShareOverlay frame={frame} layout={layout} scale={scale} />
        </View>
      </View>

      {/* Off-screen copy at exactly the export's pixel size, captured to PNG for the video overlay. */}
      <View pointerEvents="none" style={styles.offscreen}>
        <ShareOverlay ref={captureRefView} frame={frame} layout={layout} scale={1 / pr} />
      </View>

      <View style={styles.actions}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {busy ? <Text style={styles.notice}>Preparando vídeo…</Text> : null}
        <Button label="Salvar na galeria" disabled={busy || !sizeKnown} onPress={() => void save()} />
        <Button label="Compartilhar" variant="secondary" disabled={busy || !sizeKnown} onPress={() => void share()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 12, alignItems: 'stretch' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  preview: { alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: colors.ground },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  actions: { marginTop: 'auto', gap: 10, paddingBottom: 12 },
  notice: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.soft, textAlign: 'center' },
});
