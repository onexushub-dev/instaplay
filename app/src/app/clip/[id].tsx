import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useVideoPlayer } from 'expo-video';
import { type ComponentRef, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createThumbnail, exportClip, findContentStart } from '../../../modules/replay-camera';
import { ExportProgress, type ExportJob } from '../../components/ExportProgress';
import { clipNumber, seconds, timeOfDay } from '../../components/format';
import {
  BackIcon,
  CloseIcon,
  DownloadIcon,
  ExpandIcon,
  PauseIcon,
  PlayIcon,
  RotateIcon,
  ShareIcon,
  TrashIcon,
} from '../../components/icons';
import { Playhead } from '../../components/Playhead';
import { TrimBar } from '../../components/TrimBar';
import { removeFile, repo } from '../../data/mmkv';
import { MAX_CLIP_NAME } from '../../data/schema';
import type { MessageKey } from '../../i18n';
import { useT } from '../../i18n/useT';
import { effectiveSettings } from '../../modes/registry';
import { captureOverlay } from '../../share/captureOverlay';
import { contentFloor, nextRotation, outputMs, raiseToFloor, readEdit, SPEEDS, turnedSize } from '../../share/editing';
import { clipWindow } from '../../share/trim';
import { usePlan } from '../../share/entitlement';
import { exportOptions } from '../../share/exportOptions';
import { frameLayout } from '../../share/layout';
import { ShareOverlay } from '../../share/ShareOverlay';
import { ZoomableVideo } from '../../share/ZoomableVideo';
import { colors, fonts } from '../../theme/tokens';

const SLIDE_MS = 220;
/** Which side the next clip comes in from; set just before navigating, read by the screen that mounts. */
let enterFrom: 1 | -1 | 0 = 0;

const SAVED_VISIBLE_MS = 3500;
// The share sheet is up long before `shareAsync` returns (it waits for the sheet to close), so the card leaves early.
const SHARE_HANDOFF_MS = 1200;

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

export default function ClipRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Keyed by clip: moving to another clip starts the editor from that clip's own state.
  return <ClipEditor key={id} id={id} />;
}

/**
 * One screen to edit, preview and send a lance: cut, speed, sound and zoom on the exact frame that gets exported
 * (9:16 with the app mark), then save to Photos or share. Deleting and renaming live in the top bar.
 */
function ClipEditor({ id }: { id: string }) {
  const { t, locale } = useT();
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
  const plan = usePlan(clip?.sessionId);
  // `number` is the place in the swipe list ("2 de 3"); the clip's own number is the one it was saved with.
  const ownNumber = clip ? clipNumber(clip, number - 1) : 0;
  // The clips a swipe can move to: every clip of the session.
  const siblings = useMemo(
    () => (clip ? repo.listClips(clip.sessionId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [clip, version],
  );

  const [trim, setTrim] = useState(() => clip?.trim ?? { startMs: 0, endMs: 0 });
  const edit = readEdit(clip?.edit);
  const floor = clip?.contentStartMs ?? 0;
  // The track covers only what the clip was first saved with, so the cut can be shortened but never reach moments
  // that already belong to the previous clip.
  const win = clip ? clipWindow(clip, floor) : { startMs: 0, endMs: 0 };
  // Bumped to start the zoomed video over from the saved zoom (reset, or switching to/from full screen).
  const [zoomKey, setZoomKey] = useState(0);
  const [full, setFull] = useState(false);
  const window = useWindowDimensions();
  const [name, setName] = useState(() => clip?.name ?? '');
  const [playing, setPlayingState] = useState(true);
  const scrubbing = useRef(false);
  const wantsPlay = useRef(true);
  const [scrubMs, setScrubMs] = useState<number>();

  const [videoSize, setVideoSize] = useState({ width: 1920, height: 1080 });
  // Exports wait for the real shape: a portrait clip exported with the landscape default gets wrong bands.
  const [sizeKnown, setSizeKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  // What is being made right now, so the screen can say what for and for how long.
  const [job, setJob] = useState<ExportJob>();
  // Like the Photos app: the clip leaves to one side while the next one comes in from the other.
  const [slide] = useState(() => new Animated.Value(enterFrom * window.width));
  useEffect(() => {
    if (enterFrom === 0) return;
    enterFrom = 0;
    Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);
  // A key, not a text: it is shown in whatever language is current.
  const [notice, setNotice] = useState<MessageKey>();
  // The "saved" confirmation stays long enough to be read.
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [saved]);
  const exporting = useRef(false);
  const exported = useRef<{ key: string; path: string } | undefined>(undefined);
  const made = useRef<string[]>([]);
  const captureRefView = useRef<ComponentRef<typeof View>>(null);

  // The shape after the player's own turn; the clip's own rotation is already in the thumbnail's shape.
  const shape = turnedSize(videoSize, edit.rotation);
  // A landscape clip is exported (and previewed) in a landscape frame; a vertical one in a vertical frame.
  const landscape = shape.width > shape.height;
  const options = clip ? exportOptions(plan, clip.edit, clip.trim, landscape) : undefined;
  const frame = landscape
    ? { width: options?.width ?? 1920, height: options?.height ?? 1080 }
    : { width: options?.width ?? 1080, height: options?.height ?? 1920 };
  const layout = frameLayout(shape, frame);
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

  // The first time a clip opens, find where its picture starts: a black start is not part of the video.
  const hasFloor = clip?.contentStartMs !== undefined;
  useEffect(() => {
    if (!clipPath || hasFloor) return;
    let alive = true;
    findContentStart(clipPath)
      .catch(() => 0)
      .then((contentMs) => {
        if (!alive) return;
        const current = repo.getClip(id);
        if (!current) return;
        const floor = contentFloor(contentMs, current.durationMs);
        const own = clipWindow(current, floor);
        const raised = raiseToFloor(current.trim, own.startMs, own.endMs);
        if (raised === current.trim) return void repo.updateClip(id, { contentStartMs: floor });
        repo.updateClip(id, { contentStartMs: floor, trim: raised });
        setTrim(raised);
        seek(player, raised.startMs);
      });
    return () => {
      alive = false;
    };
  }, [clipPath, hasFloor, id, player]);

  // Loop the cut; follow speed and sound live.
  useEffect(() => {
    applyPlayback(player, edit.speed, edit.muted);
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (scrubbing.current) return;
      if (currentTime >= trim.endMs / 1000 || currentTime < trim.startMs / 1000 - 0.5) seek(player, trim.startMs);
    });
    return () => sub.remove();
  }, [player, trim, edit.speed, edit.muted]);

  if (!clip || !session || !options) {
    return (
      <SafeAreaView style={styles.missingRoot}>
        <IconButton label={t('common.back')} onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={styles.missing}>{t('clip.missing')}</Text>
      </SafeAreaView>
    );
  }

  /** Swipe like the Photos app: left shows the next clip, right the previous one. */
  function goBy(step: 1 | -1) {
    const at = siblings.findIndex((c) => c.id === id);
    const target = siblings[at + step];
    if (!target) return;
    Animated.timing(slide, {
      toValue: -step * window.width,
      duration: SLIDE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      enterFrom = step;
      router.setParams({ id: target.id });
    });
  }

  function setEdit(patch: Partial<ReturnType<typeof readEdit>>) {
    const next = { ...edit, ...patch };
    repo.updateClip(id, {
      edit: {
        speed: next.speed,
        muted: next.muted,
        ...(next.zoom ? { zoom: next.zoom } : {}),
        ...(next.rotation ? { rotation: next.rotation } : {}),
      },
    });
  }

  function commitZoom(z: { scale: number; cx: number; cy: number }) {
    setEdit({ zoom: z.scale > 1 ? z : undefined });
  }

  function openFull(on: boolean) {
    setFull(on);
    setZoomKey((k) => k + 1);
  }

  function togglePlay() {
    wantsPlay.current = !wantsPlay.current;
    setPlayingState(wantsPlay.current);
    setPlaying(player, wantsPlay.current);
  }

  /** While a handle is dragged the preview shows what that edge will cut; letting go plays the new cut again. */
  function scrub(next: { startMs: number; endMs: number }, moved: 'start' | 'end') {
    setTrim(next);
    scrubTo(moved === 'start' ? next.startMs : Math.max(next.startMs, next.endMs - 500));
  }

  /** The cursor (or a handle) is on `ms`: hold playback there while the finger is down. */
  function scrubTo(ms: number) {
    if (!scrubbing.current) {
      scrubbing.current = true;
      player.pause();
    }
    setScrubMs(ms);
    seek(player, ms);
  }

  function endScrub() {
    scrubbing.current = false;
    setScrubMs(undefined);
    setPlaying(player, wantsPlay.current);
  }

  function commitTrim(next: { startMs: number; endMs: number }) {
    scrubbing.current = false;
    setScrubMs(undefined);
    repo.updateClip(id, { trim: next });
    seek(player, next.startMs);
    setPlaying(player, wantsPlay.current);
  }

  const saveName = () => {
    if (clip && name.trim() !== (clip.name ?? '')) repo.renameClip(id, name);
  };

  function confirmDelete() {
    Alert.alert(t('clip.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('clip.delete'),
        style: 'destructive',
        onPress: () => {
          const at = siblings.findIndex((c) => c.id === id);
          const next = siblings[at + 1] ?? siblings[at - 1];
          removeFile(clip!.path);
          repo.deleteClip(id);
          if (next) {
            enterFrom = siblings[at + 1] ? 1 : -1;
            router.setParams({ id: next.id });
          }
          else router.back();
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

  async function run(kind: ExportJob['kind'], action: (path: string) => Promise<void>) {
    if (exporting.current || !sizeKnown) return;
    exporting.current = true;
    saveName(); // a name typed without closing the keyboard still counts
    setBusy(true);
    setNotice(undefined);
    setJob({ kind, stage: 'preparing' });
    try {
      const path = await ensureExport();
      setJob({ kind, stage: 'delivering' });
      if (kind === 'share') {
        setTimeout(() => setJob((j) => (j && j.kind === 'share' ? undefined : j)), SHARE_HANDOFF_MS);
      }
      await action(path);
    } catch {
      setNotice('clip.prepareFailed');
    } finally {
      exporting.current = false;
      setBusy(false);
      setJob(undefined);
    }
  }

  const save = () =>
    run('save', async (path) => {
      const { granted } = await requestPermissionsAsync(true, ['video']);
      if (!granted) return setNotice('clip.noPhotos');
      await Asset.create(`file://${path}`);
      repo.updateClip(id, { savedAt: Date.now() });
      setSaved(true);
    });

  const share = () => run('share', async (path) => {
      await shareAsync(`file://${path}`, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
      repo.updateClip(id, { sharedAt: Date.now() });
    });

  // Preview: the export's frame as large as the whole screen allows; the controls sit over it.
  const previewHeight = Math.min(window.height, (window.width * frame.height) / frame.width);
  const scale = previewHeight / frame.height;
  const pr = PixelRatio.get();
  const zoomed = (edit.zoom?.scale ?? 1) > 1;
  const videoBox = {
    left: layout.video.x * scale,
    top: layout.video.y * scale,
    width: layout.video.width * scale,
    height: layout.video.height * scale,
  };
  const busyActions = busy || !sizeKnown;

  if (full) {
    // The whole screen shows the raw video, so a pinch has room; the zoom is the same one the export uses.
    const fit = Math.min(window.width / shape.width, window.height / shape.height);
    const w = shape.width * fit;
    const h = shape.height * fit;
    return (
      <Animated.View style={[styles.full, { transform: [{ translateX: slide }] }]}>
        <ZoomableVideo
          key={zoomKey}
          player={player}
          area={window}
          box={{ left: (window.width - w) / 2, top: (window.height - h) / 2, width: w, height: h }}
          zoom={edit.zoom}
          rotation={edit.rotation}
          onCommit={commitZoom}
          onTap={togglePlay}
          onSwipe={goBy}
        />
        {!playing ? (
          <View pointerEvents="none" style={styles.pausedBadge}>
            <PlayIcon color={colors.text} size={36} />
          </View>
        ) : null}
        <SafeAreaView pointerEvents="box-none" style={styles.fullTop}>
          {zoomed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('clip.resetZoom')}
              onPress={() => {
                setEdit({ zoom: undefined });
                setZoomKey((k) => k + 1);
              }}
              style={styles.zoomBadge}>
              <Text style={styles.zoomText}>{`${edit.zoom!.scale.toFixed(1)}x  ✕`}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <IconButton label={t('clip.exitFullScreen')} onPress={() => openFull(false)}>
            <CloseIcon />
          </IconButton>
        </SafeAreaView>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.root, { transform: [{ translateX: slide }] }]}>
      <View style={styles.stage}>
        <View style={[styles.preview, { width: frame.width * scale, height: previewHeight }]}>
          <ZoomableVideo
            key={zoomKey}
            player={player}
            area={{ width: frame.width * scale, height: previewHeight }}
            box={videoBox}
            zoom={edit.zoom}
            rotation={edit.rotation}
            onCommit={commitZoom}
            onTap={togglePlay}
            onSwipe={goBy}
          />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ShareOverlay frame={frame} layout={layout} scale={scale} watermark={options.watermark} />
          </View>
          {!playing ? (
            <View pointerEvents="none" style={styles.pausedBadge}>
              <View style={styles.pausedDisc}>
                <PlayIcon color={colors.text} size={36} />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {/* Off-screen copy at exactly the export's pixel size, captured to PNG for the video overlay. */}
      <View pointerEvents="none" style={styles.offscreen}>
        <ShareOverlay ref={captureRefView} frame={frame} layout={layout} scale={1 / pr} watermark={options.watermark} />
      </View>

      {/* Everything below floats over the video, on dark translucent backgrounds so it reads in the sun. */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overTop}>
        <View style={styles.top}>
          <IconButton label={t('common.back')} onPress={() => router.back()}>
            <BackIcon />
          </IconButton>
          <TextInput
            accessibilityLabel={t('clip.name')}
            value={name}
            onChangeText={setName}
            onSubmitEditing={saveName}
            onBlur={saveName}
            placeholder={t('clip.namePlaceholder', { number: ownNumber, time: timeOfDay(clip.createdAt, locale) })}
            placeholderTextColor={colors.soft}
            maxLength={MAX_CLIP_NAME}
            returnKeyType="done"
            selectTextOnFocus
            style={styles.nameInput}
          />
          <IconButton label={t('clip.deleteClip')} onPress={confirmDelete}>
            <TrashIcon />
          </IconButton>
          <IconButton
            label={t('clip.saveToPhotos')}
            disabled={busyActions}
            loading={job !== undefined && job.kind === 'save'}
            onPress={() => void save()}>
            <DownloadIcon />
          </IconButton>
          <IconButton
            label={t('clip.share')}
            disabled={busyActions}
            loading={job !== undefined && job.kind === 'share'}
            onPress={() => void share()}>
            <ShareIcon />
          </IconButton>
        </View>
        <View pointerEvents="box-none" style={styles.sideRow}>
          {zoomed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('clip.resetZoom')}
              onPress={() => {
                setEdit({ zoom: undefined });
                setZoomKey((k) => k + 1);
              }}
              style={styles.zoomBadge}>
              <Text style={styles.zoomText}>{`${edit.zoom!.scale.toFixed(1)}x  ✕`}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <View style={styles.sideColumn}>
            <IconButton
              label={t('clip.rotate')}
              onPress={() => {
                // A zoom window means something else after a turn, so start from the whole picture again.
                setEdit({ rotation: nextRotation(edit.rotation), zoom: undefined });
                setZoomKey((k) => k + 1);
              }}>
              <RotateIcon />
            </IconButton>
            <IconButton label={t('clip.fullScreen')} onPress={() => openFull(true)}>
              <ExpandIcon />
            </IconButton>
          </View>
        </View>
      </SafeAreaView>

      {saved && !job ? (
        <Pressable accessibilityRole="alert" onPress={() => setSaved(false)} style={styles.savedWrap}>
          <View style={styles.savedCard}>
            <View style={styles.savedCheck}>
              <Text style={styles.savedCheckMark}>✓</Text>
            </View>
            <Text style={styles.savedText}>{t('clip.savedToPhotos')}</Text>
            <Text style={styles.savedHint}>{t('clip.savedHint')}</Text>
          </View>
        </Pressable>
      ) : null}
      {job ? <ExportProgress job={job} /> : null}

      <SafeAreaView edges={['bottom']} pointerEvents="box-none" style={styles.overBottom}>
        <View style={styles.panel}>
          {busy ? null : notice ? (
            <Text style={styles.notice}>{t(notice)}</Text>
          ) : null}
          {siblings.length > 1 ? (
            <Text style={styles.position}>{t('clip.ofTotal', {
                number: siblings.findIndex((c) => c.id === id) + 1,
                total: siblings.length,
              })}</Text>
          ) : null}
          <View style={styles.trimLabels}>
            <Text style={styles.small}>{`-${seconds(win.endMs - win.startMs)}`}</Text>
            <Text style={styles.cut}>{t('clip.cut', { time: seconds(outputMs(trim, edit.speed)) })}</Text>
            <Text style={styles.small}>{t('clip.trigger')}</Text>
          </View>
          <View style={styles.trimRow}>
            <IconButton label={playing ? t('clip.pause') : t('clip.play')} onPress={togglePlay}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <View style={styles.trimBar}>
              <TrimBar
                durationMs={win.endMs}
                floorMs={win.startMs}
                trim={trim}
                maxMs={maxMs}
                onChange={scrub}
                onCommit={commitTrim}>
                <Playhead
                  player={player}
                  durationMs={win.endMs}
                  floorMs={win.startMs}
                  trim={trim}
                  speed={edit.speed}
                  scrubMs={scrubMs}
                  onScrub={scrubTo}
                  onScrubEnd={endScrub}
                />
              </TrimBar>
            </View>
          </View>
          <View style={styles.tools}>
            {SPEEDS.map((speed) => (
              <Tool
                key={speed}
                label={`${speed}x`}
                a11y={t('clip.speed', { speed })}
                active={edit.speed === speed}
                onPress={() => setEdit({ speed })}
              />
            ))}
            <Tool
              label={edit.muted || edit.speed !== 1 ? t('clip.muted') : t('clip.sound')}
              a11y={t('clip.sound')}
              active={!edit.muted && edit.speed === 1}
              onPress={edit.speed !== 1 ? undefined : () => setEdit({ muted: !edit.muted })}
            />
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  loading,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner in place of the icon: this is the button whose job is running. */
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[styles.icon, disabled && !loading && styles.iconOff]}>
      {loading ? <ActivityIndicator color={colors.text} /> : children}
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

const SCRIM = 'rgba(15,16,13,0.74)';
const EDGE = 'rgba(243,239,228,0.22)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  missingRoot: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 16, gap: 12 },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  preview: { overflow: 'hidden', backgroundColor: colors.ground },
  overTop: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  overBottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  sideRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 },
  sideColumn: { gap: 8 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SCRIM,
    borderWidth: 1,
    borderColor: EDGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOff: { opacity: 0.4 },
  nameInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: SCRIM,
    borderWidth: 1,
    borderColor: EDGE,
    paddingHorizontal: 14,
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  panel: {
    marginHorizontal: 8,
    marginBottom: 8,
    padding: 12,
    gap: 10,
    borderRadius: 22,
    backgroundColor: SCRIM,
    borderWidth: 1,
    borderColor: EDGE,
  },
  full: { flex: 1, backgroundColor: '#000' },
  fullTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  pausedBadge: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pausedDisc: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: SCRIM,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  zoomBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  zoomText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.onAccent },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  position: { fontFamily: fonts.body, fontSize: 12, color: colors.text, opacity: 0.8, textAlign: 'center' },
  savedWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  savedCard: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  savedCheck: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  savedCheckMark: { fontFamily: fonts.bodyBold, fontSize: 24, color: colors.ground },
  savedText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  savedHint: { fontFamily: fonts.body, fontSize: 13, color: colors.text, opacity: 0.8 },
  notice: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, textAlign: 'center' },
  trimLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trimRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trimBar: { flex: 1 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.text, opacity: 0.8 },
  cut: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  tools: { flexDirection: 'row', gap: 6 },
  tool: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EDGE,
    backgroundColor: 'rgba(243,239,228,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: { borderWidth: 2, borderColor: colors.accent },
  toolText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  missing: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
