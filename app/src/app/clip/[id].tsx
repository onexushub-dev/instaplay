import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type ComponentRef, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Image, PixelRatio, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createThumbnail, exportClip } from '../../../modules/replay-camera';
import { seconds, timeOfDay } from '../../components/format';
import { BackIcon, DownloadIcon, PauseIcon, PlayIcon, ShareIcon, TrashIcon } from '../../components/icons';
import { TrimBar } from '../../components/TrimBar';
import { removeFile, repo } from '../../data/mmkv';
import { MAX_CLIP_NAME } from '../../data/schema';
import { effectiveSettings } from '../../modes/registry';
import { captureOverlay } from '../../share/captureOverlay';
import { NO_ZOOM, outputMs, readEdit, SPEEDS, type Zoom } from '../../share/editing';
import { useEntitlement } from '../../share/entitlement';
import { exportOptions } from '../../share/exportOptions';
import { frameLayout } from '../../share/layout';
import { ShareOverlay } from '../../share/ShareOverlay';
import { useZoomGesture } from '../../share/useZoomGesture';
import { colors, fonts } from '../../theme/tokens';

const PREPARE_FAILED = 'Não foi possível preparar o vídeo. Tente de novo.';

type Player = ReturnType<typeof useVideoPlayer>;

/** Player settings live outside the component: the React Compiler forbids mutating a hook's return value. */
function applyPlayback(player: Player, speed: number, muted: boolean) {
  player.playbackRate = speed;
  player.muted = muted || speed !== 1;
}

function seek(player: Player, ms: number) {
  player.currentTime = ms / 1000;
}

function setPlaying(player: Player, playing: boolean) {
  if (playing) player.play();
  else player.pause();
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

/**
 * One screen to edit, preview and send a lance: cut, speed, sound and zoom on the exact frame that gets exported
 * (9:16 with the app mark), then save to Photos or share. Deleting and renaming live in the top bar.
 */
export default function ClipEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
  const clip = useMemo(() => repo.getClip(id), [id, version]);
  const number = useMemo(
    () => (clip ? repo.listClips(clip.sessionId).findIndex((c) => c.id === id) + 1 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [clip, id, version],
  );
  const session = clip ? repo.getSession(clip.sessionId) : undefined;
  const maxMs = session ? effectiveSettings(session.sport, repo.getPrefs()).bufferSeconds * 1000 : undefined;
  const { tier } = useEntitlement();

  const [trim, setTrim] = useState(() => clip?.trim ?? { startMs: 0, endMs: 0 });
  const edit = readEdit(clip?.edit);
  const [liveZoom, setLiveZoom] = useState<Zoom>(edit.zoom ?? NO_ZOOM);
  const [name, setName] = useState(() => clip?.name ?? '');
  const [playing, setPlayingState] = useState(true);
  const scrubbing = useRef(false);
  const wantsPlay = useRef(true);

  const [videoSize, setVideoSize] = useState({ width: 1920, height: 1080 });
  // Exports wait for the real shape: a portrait clip exported with the landscape default gets wrong bands.
  const [sizeKnown, setSizeKnown] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const exporting = useRef(false);
  const exported = useRef<{ key: string; path: string } | undefined>(undefined);
  const made = useRef<string[]>([]);
  const captureRefView = useRef<ComponentRef<typeof View>>(null);

  const options = clip ? exportOptions(tier, clip.edit, clip.trim) : undefined;
  const frame = { width: options?.width ?? 1080, height: options?.height ?? 1920 };
  const layout = frameLayout(videoSize, frame);
  // The real aspect ratio (rotation applied) comes from the clip's thumbnail.
  const clipPath = clip?.path;
  const startMs = clip?.trim.startMs ?? 0;
  useEffect(() => {
    if (!clipPath) return;
    createThumbnail(clipPath, startMs)
      .then((path) => Image.getSize(`file://${path}`))
      .then(({ width, height }) => setVideoSize({ width, height }))
      .catch(() => {}) // keep the default shape
      .finally(() => setSizeKnown(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shape does not change with the cut
  }, [clipPath]);

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
    p.timeUpdateEventInterval = 0.1;
    p.currentTime = trim.startMs / 1000;
    p.play();
  });

  // Loop the cut; follow speed and sound live.
  useEffect(() => {
    applyPlayback(player, edit.speed, edit.muted);
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (scrubbing.current) return;
      if (currentTime >= trim.endMs / 1000 || currentTime < trim.startMs / 1000 - 0.5) seek(player, trim.startMs);
    });
    return () => sub.remove();
  }, [player, trim, edit.speed, edit.muted]);

  const zoom = useZoomGesture({
    zoom: liveZoom,
    size: { width: layout.video.width, height: layout.video.height },
    onChange: setLiveZoom,
    onCommit: (z) => setEdit({ zoom: z.scale > 1 ? z : undefined }),
    onTap: () => togglePlay(),
  });

  if (!clip || !session || !options) {
    return (
      <SafeAreaView style={styles.root}>
        <IconButton label="Voltar" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={styles.missing}>Este clipe não está mais no celular.</Text>
      </SafeAreaView>
    );
  }

  function setEdit(patch: Partial<ReturnType<typeof readEdit>>) {
    const next = { ...edit, ...patch };
    repo.updateClip(id, { edit: { speed: next.speed, muted: next.muted, ...(next.zoom ? { zoom: next.zoom } : {}) } });
  }

  function togglePlay() {
    wantsPlay.current = !wantsPlay.current;
    setPlayingState(wantsPlay.current);
    setPlaying(player, wantsPlay.current);
  }

  /** While a handle is dragged the preview shows what that edge will cut; letting go plays the new cut again. */
  function scrub(next: { startMs: number; endMs: number }, moved: 'start' | 'end') {
    if (!scrubbing.current) {
      scrubbing.current = true;
      player.pause();
    }
    setTrim(next);
    seek(player, moved === 'start' ? next.startMs : Math.max(next.startMs, next.endMs - 500));
  }

  function commitTrim(next: { startMs: number; endMs: number }) {
    scrubbing.current = false;
    repo.updateClip(id, { trim: next });
    seek(player, next.startMs);
    setPlaying(player, wantsPlay.current);
  }

  const saveName = () => {
    if (clip && name.trim() !== (clip.name ?? '')) repo.renameClip(id, name);
  };

  function confirmDelete() {
    Alert.alert('Apagar este clipe?', undefined, [
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
    if (exporting.current || !sizeKnown) return;
    exporting.current = true;
    saveName(); // a name typed without closing the keyboard still counts
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

  // Preview: as large as the middle of the screen allows, in the export's 9:16 frame.
  const previewHeight = Math.min(area.height, (area.width * frame.height) / frame.width);
  const scale = previewHeight / frame.height;
  const pr = PixelRatio.get();
  const zoomed = liveZoom.scale > 1;
  const videoBox = {
    left: layout.video.x * scale,
    top: layout.video.y * scale,
    width: layout.video.width * scale,
    height: layout.video.height * scale,
  };
  const busyActions = busy || !sizeKnown;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <IconButton label="Voltar" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <TextInput
          accessibilityLabel="Nome do clipe"
          value={name}
          onChangeText={setName}
          onSubmitEditing={saveName}
          onBlur={saveName}
          placeholder={`Clipe #${number} · ${timeOfDay(clip.createdAt)}`}
          placeholderTextColor={colors.muted}
          maxLength={MAX_CLIP_NAME}
          returnKeyType="done"
          selectTextOnFocus
          style={styles.nameInput}
        />
        <IconButton label="Apagar clipe" onPress={confirmDelete}>
          <TrashIcon />
        </IconButton>
        <IconButton label="Salvar na galeria" disabled={busyActions} onPress={() => void save()}>
          <DownloadIcon />
        </IconButton>
        <IconButton label="Compartilhar" disabled={busyActions} onPress={() => void share()}>
          <ShareIcon />
        </IconButton>
      </View>

      <View style={styles.area} onLayout={(e) => setArea(e.nativeEvent.layout)}>
        <View style={[styles.preview, { width: frame.width * scale, height: previewHeight }]}>
          <View {...zoom} accessibilityLabel="Vídeo" style={[styles.videoBox, videoBox]}>
            <VideoView
              player={player}
              contentFit="contain"
              nativeControls={false}
              style={[
                StyleSheet.absoluteFill,
                {
                  transform: [
                    { translateX: (0.5 - liveZoom.cx) * videoBox.width * liveZoom.scale },
                    { translateY: (0.5 - liveZoom.cy) * videoBox.height * liveZoom.scale },
                    { scale: liveZoom.scale },
                  ],
                },
              ]}
            />
          </View>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ShareOverlay frame={frame} layout={layout} scale={scale} />
          </View>
          {!playing ? (
            <View pointerEvents="none" style={styles.pausedBadge}>
              <PlayIcon color={colors.text} size={36} />
            </View>
          ) : null}
          {zoomed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar zoom para 1x"
              onPress={() => {
                setLiveZoom(NO_ZOOM);
                setEdit({ zoom: undefined });
              }}
              style={styles.zoomBadge}>
              <Text style={styles.zoomText}>{`${liveZoom.scale.toFixed(1)}x  ✕`}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Off-screen copy at exactly the export's pixel size, captured to PNG for the video overlay. */}
      <View pointerEvents="none" style={styles.offscreen}>
        <ShareOverlay ref={captureRefView} frame={frame} layout={layout} scale={1 / pr} />
      </View>

      {busy ? (
        <Text style={styles.notice}>Preparando vídeo…</Text>
      ) : notice ? (
        <Text style={styles.notice}>{notice}</Text>
      ) : null}

      <View style={styles.trim}>
        <View style={styles.trimLabels}>
          <Text style={styles.small}>{`-${seconds(clip.durationMs)}`}</Text>
          <Text style={styles.cut}>{`Corte: ${seconds(outputMs(trim, edit.speed))}`}</Text>
          <Text style={styles.small}>gatilho</Text>
        </View>
        <View style={styles.trimRow}>
          <IconButton label={playing ? 'Pausar' : 'Reproduzir'} onPress={togglePlay}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </IconButton>
          <View style={styles.trimBar}>
            <TrimBar durationMs={clip.durationMs} trim={trim} maxMs={maxMs} onChange={scrub} onCommit={commitTrim} />
          </View>
        </View>
      </View>

      <View style={styles.tools}>
        {SPEEDS.map((speed) => (
          <Tool
            key={speed}
            label={`${speed}x`}
            a11y={`Velocidade ${speed}x`}
            active={edit.speed === speed}
            onPress={() => setEdit({ speed })}
          />
        ))}
        <Tool
          label={edit.muted || edit.speed !== 1 ? 'Sem som' : 'Som'}
          a11y="Som"
          active={!edit.muted && edit.speed === 1}
          onPress={edit.speed !== 1 ? undefined : () => setEdit({ muted: !edit.muted })}
        />
      </View>
    </SafeAreaView>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.icon, disabled && styles.iconOff]}>
      {children}
    </Pressable>
  );
}

function Tool({
  label,
  a11y,
  active,
  onPress,
}: {
  label: string;
  a11y?: string;
  active: boolean;
  onPress?: () => void;
}) {
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
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 16, gap: 12, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOff: { opacity: 0.4 },
  nameInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.ground },
  videoBox: { position: 'absolute', overflow: 'hidden' },
  pausedBadge: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  zoomBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  zoomText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onAccent },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  notice: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.soft, textAlign: 'center' },
  trim: { gap: 8 },
  trimLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trimRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trimBar: { flex: 1 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  cut: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.text },
  tools: { flexDirection: 'row', gap: 6 },
  tool: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: { borderWidth: 2, borderColor: colors.accent },
  toolText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  missing: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
