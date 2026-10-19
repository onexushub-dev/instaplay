import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PixelRatio, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createThumbnail, exportClip, shareToInstagramStory } from '../../../modules/replay-camera';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { BackIcon } from '../../components/icons';
import { repo } from '../../data/mmkv';
import type { Prefs } from '../../data/schema';
import { captureOverlay } from '../../story/captureOverlay';
import { useEntitlement } from '../../story/entitlement';
import { exportOptions } from '../../story/exportOptions';
import { storyLayout } from '../../story/layout';
import { StoryOverlay } from '../../story/StoryOverlay';
import { TEMPLATES, storyTexts } from '../../story/templates';
import { colors, fonts } from '../../theme/tokens';

const PREPARE_FAILED = 'Não foi possível preparar o vídeo. Tente de novo.';
const metaAppId = (Constants.expoConfig?.extra?.metaAppId as string | undefined) ?? '';

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

/** Preview of the 9:16 Story (whole video between template bands); post, save to Photos, share. */
export default function StoryScreen() {
  const { clipId } = useLocalSearchParams<{ clipId: string }>();
  const clip = useMemo(() => repo.getClip(clipId), [clipId]);
  const session = useMemo(() => (clip ? repo.getSession(clip.sessionId) : undefined), [clip]);
  const { tier } = useEntitlement();
  const [prefs, setPrefsState] = useState<Prefs>(() => repo.getPrefs());
  const [arena, setArena] = useState(prefs.arenaName ?? '');
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
  const layout = storyLayout(videoSize, frame);
  // The arena as typed (not only once saved), so the preview and the export never lag behind the field.
  const texts = session
    ? storyTexts(prefs.storyTemplate, { sport: session.sport, startedAt: session.startedAt, arena: arena.trim() || undefined, gameName: session.name })
    : { top: [], bottom: [] };

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

  const update = (patch: Partial<Prefs>) => {
    setPrefsState(repo.setPrefs(patch));
    exported.current = undefined; // the template changed: export again
  };

  /** One export per look (cut, edits, template, arena), reused by all three buttons. */
  async function ensureExport(): Promise<string> {
    const key = JSON.stringify([options, texts, prefs.storyTemplate, layout]);
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
    const typed = arena.trim() || undefined;
    if (typed !== prefs.arenaName) update({ arenaName: typed });
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

  const post = () =>
    run(async (path) => {
      // Without a Meta App ID the composer can't open: go straight to the share sheet, no false alarm.
      const opened = metaAppId ? (await shareToInstagramStory(path, metaAppId)) === 'opened' : false;
      if (!opened) {
        if (metaAppId) setNotice('Instagram não encontrado. Escolha onde compartilhar.');
        await shareAsync(`file://${path}`, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
      }
    });

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
        <Text style={styles.notice}>Este lance não está mais no celular.</Text>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={styles.back}>
          <BackIcon />
        </Pressable>
        <Text style={styles.title}>Prévia do Story</Text>
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
          <StoryOverlay frame={frame} layout={layout} texts={texts} template={prefs.storyTemplate} watermark={options.watermark} scale={scale} />
        </View>
      </View>

      {/* Off-screen copy at exactly the export's pixel size, captured to PNG for the video overlay. */}
      <View pointerEvents="none" style={styles.offscreen}>
        <StoryOverlay
          ref={captureRefView}
          frame={frame}
          layout={layout}
          texts={texts}
          template={prefs.storyTemplate}
          watermark={options.watermark}
          scale={1 / pr}
        />
      </View>

      <View style={styles.chips}>
        {TEMPLATES.map((t) => (
          <Chip key={t.id} label={t.label} selected={prefs.storyTemplate === t.id} onPress={() => update({ storyTemplate: t.id })} />
        ))}
      </View>
      <TextInput
        accessibilityLabel="Nome da arena (opcional)"
        placeholder="Nome da arena (opcional)"
        placeholderTextColor={colors.muted}
        value={arena}
        onChangeText={setArena}
        onBlur={() => update({ arenaName: arena.trim() || undefined })}
        onSubmitEditing={() => update({ arenaName: arena.trim() || undefined })}
        returnKeyType="done"
        maxLength={40}
        style={styles.input}
      />

      <View style={styles.actions}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {busy ? <Text style={styles.notice}>Preparando vídeo…</Text> : null}
        <Button label="Postar no Story" disabled={busy || !sizeKnown} onPress={() => void post()} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button label="Salvar na galeria" variant="secondary" disabled={busy || !sizeKnown} onPress={() => void save()} />
          </View>
          <View style={styles.flex}>
            <Button label="Compartilhar" variant="secondary" disabled={busy || !sizeKnown} onPress={() => void share()} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 20, gap: 12, alignItems: 'stretch' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
  preview: { alignSelf: 'center', borderRadius: 16, overflow: 'hidden', backgroundColor: colors.ground },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  actions: { marginTop: 'auto', gap: 10, paddingBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  notice: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.soft, textAlign: 'center' },
});
