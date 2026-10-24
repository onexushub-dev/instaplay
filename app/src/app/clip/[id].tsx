import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { shareAsync } from 'expo-sharing';
import { useVideoPlayer } from 'expo-video';
import { type ComponentRef, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  Image,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createThumbnail, exportClip, findContentStart, isFocusSupported } from '../../../modules/replay-camera';
import { ClipEdit } from '../../clip/ClipEdit';
import { ClipWatch } from '../../clip/ClipWatch';
import { beginEdit, type EditSnapshot, hasChanges, lastTool, rememberTool, restorePatch, type ToolId } from '../../clip/editSession';
import { IconButton, SCRIM } from '../../clip/IconButton';
import { ToolBar } from '../../clip/ToolBar';
import { EDIT_TOOLS, type EditTool, type FocusUi, type ToolContext } from '../../clip/tools';
import { WatchProgress } from '../../clip/WatchProgress';
import { ExportProgress, type ExportJob } from '../../components/ExportProgress';
import { clipNumber, seconds, timeOfDay } from '../../components/format';
import { BackIcon, PauseIcon, PlayIcon } from '../../components/icons';
import { Playhead } from '../../components/Playhead';
import { TrimBar } from '../../components/TrimBar';
import { useReduceMotion } from '../../components/useReduceMotion';
import { readFocusFile } from '../../data/focusFile';
import { removeFile, repo } from '../../data/mmkv';
import { focusQueue } from '../../focus/appFocusQueue';
import { useFocusFraming } from '../../focus/useFocusFraming';
import { effectiveSettings } from '../../modes/registry';
import { captureOverlay } from '../../share/captureOverlay';
import { contentFloor, nextRotation, outputMs, raiseToFloor, readEdit, turnedSize } from '../../share/editing';
import { clipWindow } from '../../share/trim';
import { useEntitlement } from '../../share/entitlement';
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
const PREPARE_FAILED = 'Não foi possível preparar o vídeo. Tente de novo.';
const FOCUS_INTRO = 'Modo Foco: a câmera acompanha o lance';
const DISCARD_TITLE = 'Descartar alterações?';
const FOCUS_INTRO_MS = 3000;
/** How long the framing takes to grow out of the whole video: the first time ever, and when it gets ready on screen. */
const FOCUS_INTRO_EASE_MS = 700;
const FOCUS_READY_EASE_MS = 400;

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
 * One clip: watch it clean (Salvar, Enviar, hold for 2x) or edit it (tool bar over the cut; Cancelar undoes). The preview
 * is the exact frame that gets exported (with the app mark).
 */
export default function ClipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Keyed by clip: moving to another clip starts the screen from that clip's own state.
  return <ClipEditor key={id} id={id} />;
}

function ClipEditor({ id }: { id: string }) {
  const version = useSyncExternalStore(repo.subscribe, repo.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
  const clip = useMemo(() => repo.getClip(id), [id, version]);
  const number = useMemo(
    () => (clip ? repo.listClips(clip.sessionId).findIndex((c) => c.id === id) + 1 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [clip, id, version],
  );
  // `number` is the place in the swipe list ("2 de 3"); the clip's own number is the one it was saved with.
  const ownNumber = clip ? clipNumber(clip, number - 1) : 0;
  const siblings = useMemo(
    () => (clip ? repo.listClips(clip.sessionId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the change signal
    [clip, version],
  );
  const session = clip ? repo.getSession(clip.sessionId) : undefined;
  const maxMs = session ? effectiveSettings(session.sport, repo.getPrefs()).bufferSeconds * 1000 : undefined;
  const { tier } = useEntitlement();

  const [trim, setTrim] = useState(() => (clip ? clip.trim : { startMs: 0, endMs: 0 }));
  const edit = readEdit(clip?.edit);
  const floor = clip?.contentStartMs ?? 0;
  // The track covers only what the clip was first saved with, so the cut can be shortened but never reach moments
  // that already belong to the previous clip.
  const win = clip ? clipWindow(clip, floor) : { startMs: 0, endMs: 0 };
  // Bumped to start the zoomed video over from the saved zoom (reset, turn, Modo Foco back on, mode switch).
  const [zoomKey, setZoomKey] = useState(0);
  // Watch (clean, Salvar/Enviar) or edit (tool bar, Cancelar/Concluir); edit keeps what Cancelar puts back.
  const [mode, setMode] = useState<'watch' | 'edit'>('watch');
  const snapshot = useRef<EditSnapshot | undefined>(undefined);
  const [openTool, setOpenTool] = useState<ToolId>(lastTool);
  // A finger held on the video in watch mode: 2x while it stays down.
  const [fast, setFast] = useState(false);
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
  const [notice, setNotice] = useState<string>();
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

  // Modo Foco: the framing of the clip's shape, once its analysis is ready and the shape is known.
  const focusSupported = isFocusSupported();
  const focusState = clip && clip.focus ? clip.focus : undefined;
  const focusFile = focusState && focusState.status === 'ready' ? focusState.file : undefined;
  const focusAspect = landscape ? 'landscape' : 'portrait';
  const track = useMemo(
    () => (focusFile && sizeKnown ? readFocusFile(focusFile, focusAspect) : undefined),
    [focusFile, focusAspect, sizeKnown],
  );
  const handZoom = edit.zoom !== undefined && edit.zoom.scale > 1;
  const focusActive = track !== undefined && edit.focus && edit.rotation === 0 && !handZoom;
  let focusChip: 'preparing' | 'on' | 'off' | undefined;
  if (edit.rotation === 0) {
    if (track) focusChip = focusActive ? 'on' : 'off';
    else if (focusSupported && (!focusState || focusState.status === 'pending')) focusChip = 'preparing';
  }
  useEffect(() => {
    const current = repo.getClip(id);
    if (current && focusSupported) focusQueue.ensure(current);
  }, [id, focusSupported]);
  // The introduction, once ever: the framing grows out of the whole video with a caption.
  const reduceMotion = useReduceMotion();
  const [introDue] = useState(() => !repo.getPrefs().focusIntroSeen);
  const [introOver, setIntroOver] = useState(false);
  const showIntro = introDue && !introOver && focusActive;
  useEffect(() => {
    if (!showIntro) return;
    repo.setPrefs({ focusIntroSeen: true });
    const timer = setTimeout(() => setIntroOver(true), FOCUS_INTRO_MS);
    return () => clearTimeout(timer);
  }, [showIntro]);
  const [readyAtOpen] = useState(() => {
    const opened = repo.getClip(id);
    return opened !== undefined && opened.focus !== undefined && opened.focus.status === 'ready';
  });
  const focusEnterMs = reduceMotion ? 0 : showIntro ? FOCUS_INTRO_EASE_MS : readyAtOpen ? 0 : FOCUS_READY_EASE_MS;

  const options = clip
    ? exportOptions(tier, clip.edit, clip.trim, landscape, focusFile && track ? { path: focusFile, ready: true } : undefined)
    : undefined;
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
  const follow = useFocusFraming(player, track, focusActive);

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

  // Android back while editing works as Cancelar, asking first when something changed (iOS has no back gesture here).
  useEffect(() => {
    if (mode !== 'edit') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      askCancelEdit();
      return true;
    });
    return () => sub.remove();
  });

  if (!clip || !session || !options) {
    return (
      <SafeAreaView style={styles.missingRoot}>
        <IconButton label="Voltar" onPress={() => router.back()}>
          <BackIcon />
        </IconButton>
        <Text style={styles.missing}>Este clipe não está mais no celular.</Text>
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
        ...(next.focus === false ? { focus: false } : {}),
      },
    });
  }

  function commitZoom(z: { scale: number; cx: number; cy: number }) {
    // A pinch on the followed picture takes over: the hand zoom stays and Modo Foco turns off.
    if (focusActive) setEdit({ zoom: z.scale > 1 ? z : undefined, focus: false });
    else setEdit({ zoom: z.scale > 1 ? z : undefined });
  }

  function toggleFocus() {
    if (focusActive) return setEdit({ focus: false });
    setEdit({ focus: true, zoom: undefined });
    setZoomKey((k) => k + 1);
  }

  function enterEdit(tool?: ToolId) {
    const current = repo.getClip(id);
    if (!current) return;
    snapshot.current = beginEdit(current);
    const first = tool ? tool : lastTool();
    // Where Modo Foco cannot run there is no Foco tool to open.
    setOpenTool(first === 'focus' && !focusSupported ? 'speed' : first);
    setMode('edit');
    setZoomKey((k) => k + 1);
  }

  function leaveEdit() {
    snapshot.current = undefined;
    setMode('watch');
    setZoomKey((k) => k + 1);
  }

  /** Cancelar: the clip's cut and choices go back to what they were when edit mode opened. */
  function cancelEdit() {
    const before = snapshot.current;
    if (before) {
      repo.updateClip(id, restorePatch(before));
      setTrim(before.trim);
      seek(player, before.trim.startMs);
    }
    leaveEdit();
  }

  function pickTool(tool: ToolId) {
    setOpenTool(tool);
    rememberTool(tool);
  }

  /** Watch mode, like Reels: 2x (silent) while a finger is held on the video; the clip's own speed after. */
  function holdFast(down: boolean) {
    setFast(down);
    if (down) applyPlayback(player, 2, true);
    else applyPlayback(player, edit.speed, edit.muted);
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
    if (follow) follow.sync(ms);
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
    if (follow) follow.sync(next.startMs);
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
      setNotice(PREPARE_FAILED);
    } finally {
      exporting.current = false;
      setBusy(false);
      setJob(undefined);
    }
  }

  const save = () =>
    run('save', async (path) => {
      const { granted } = await requestPermissionsAsync(true, ['video']);
      if (!granted) return setNotice('Sem acesso às fotos. Libere em Ajustes.');
      await Asset.create(`file://${path}`);
      repo.updateClip(id, { savedAt: Date.now() });
      setSaved(true);
    });

  const share = () => run('share', async (path) => {
      await shareAsync(`file://${path}`, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
      repo.updateClip(id, { sharedAt: Date.now() });
    });

  /** Back while editing: nothing changed leaves at once; changes ask before they are thrown away. */
  function askCancelEdit() {
    const current = repo.getClip(id);
    const before = snapshot.current;
    if (!current || !before || !hasChanges(before, current)) return cancelEdit();
    Alert.alert(DISCARD_TITLE, undefined, [
      { text: 'Continuar editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: cancelEdit },
    ]);
  }

  const pr = PixelRatio.get();
  const busyActions = busy || !sizeKnown;
  const editing = mode === 'edit';

  let focusUi: FocusUi = 'unavailable';
  if (focusChip === 'on' || focusChip === 'off' || focusChip === 'preparing') focusUi = focusChip;
  // A ready framing is read once the video's shape is known: until then it is still on its way, not impossible.
  else if (focusFile && !sizeKnown && edit.rotation === 0) focusUi = 'preparing';
  const tools = focusSupported ? EDIT_TOOLS : EDIT_TOOLS.filter((t) => t.id !== 'focus');
  const ctx: ToolContext = {
    edit,
    setEdit,
    focus: focusUi,
    toggleFocus,
    resetZoom: () => {
      setEdit({ zoom: undefined });
      setZoomKey((k) => k + 1);
    },
    turn: () => {
      // A zoom window means something else after a turn, so start from the whole picture again.
      setEdit({ rotation: nextRotation(edit.rotation), zoom: undefined });
      setZoomKey((k) => k + 1);
    },
  };
  const tool = (tools.find((t) => t.id === openTool) as EditTool | undefined) || tools[0];

  /** The export's frame as large as `area` allows, the video in it, the app mark over it. */
  function renderStage(area: { width: number; height: number }) {
    const previewHeight = Math.min(area.height, (area.width * frame.height) / frame.width);
    const scale = previewHeight / frame.height;
    const videoBox = {
      left: layout.video.x * scale,
      top: layout.video.y * scale,
      width: layout.video.width * scale,
      height: layout.video.height * scale,
    };
    return (
      <View style={styles.stage}>
        <View style={[styles.preview, { width: frame.width * scale, height: previewHeight }]}>
          <ZoomableVideo
            key={zoomKey}
            player={player}
            area={{ width: frame.width * scale, height: previewHeight }}
            box={videoBox}
            zoom={edit.zoom}
            rotation={edit.rotation}
            onCommit={editing ? commitZoom : () => {}}
            onTap={togglePlay}
            onSwipe={editing ? undefined : goBy}
            follow={follow}
            enterMs={focusEnterMs}
            pinch={editing}
            onHold={editing ? undefined : holdFast}
          />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <ShareOverlay frame={frame} layout={layout} scale={scale} />
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
    );
  }

  return (
    <Animated.View style={[styles.root, { transform: [{ translateX: slide }] }]}>
      {editing ? (
        <ClipEdit
          renderStage={renderStage}
          onCancel={cancelEdit}
          onDone={leaveEdit}
          panel={<tool.Panel ctx={ctx} />}
          cut={
            <>
              <View style={styles.trimLabels}>
                <Text style={styles.small}>{`-${seconds(win.endMs - win.startMs)}`}</Text>
                <Text style={styles.cut}>{`Corte: ${seconds(outputMs(trim, edit.speed))}`}</Text>
                <Text style={styles.small}>gatilho</Text>
              </View>
              <View style={styles.trimRow}>
                <IconButton label={playing ? 'Pausar' : 'Reproduzir'} onPress={togglePlay}>
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
            </>
          }
          toolBar={<ToolBar open={tool.id} focusOn={focusUi === 'on'} onOpen={pickTool} tools={tools} />}
        />
      ) : (
        <ClipWatch
          renderStage={renderStage}
          name={name}
          placeholder={`Clipe #${ownNumber} · ${timeOfDay(clip.createdAt)}`}
          onChangeName={setName}
          onSaveName={saveName}
          onBack={() => router.back()}
          onDelete={confirmDelete}
          focusTag={focusChip === 'on' ? 'on' : focusChip === 'preparing' ? 'preparing' : undefined}
          onFocusTag={() => enterEdit('focus')}
          notice={busy ? undefined : notice}
          position={siblings.length > 1 ? `${number} de ${siblings.length} · deslize para trocar` : undefined}
          progress={
            <WatchProgress
              player={player}
              trim={trim}
              speed={edit.speed}
              playing={playing}
              onTogglePlay={togglePlay}
              onSeek={scrubTo}
              onSeekEnd={endScrub}
            />
          }
          onEdit={() => enterEdit()}
          onSave={() => void save()}
          onShare={() => void share()}
          actionsDisabled={busyActions}
          saving={job !== undefined && job.kind === 'save'}
          sharing={job !== undefined && job.kind === 'share'}
          fast={fast}
          caption={showIntro ? FOCUS_INTRO : undefined}
        />
      )}

      {/* Off-screen copy at exactly the export's pixel size, captured to PNG for the video overlay. */}
      <View pointerEvents="none" style={styles.offscreen}>
        <ShareOverlay ref={captureRefView} frame={frame} layout={layout} scale={1 / pr} />
      </View>

      {saved && !job ? (
        <Pressable accessibilityRole="alert" onPress={() => setSaved(false)} style={styles.savedWrap}>
          <View style={styles.savedCard}>
            <View style={styles.savedCheck}>
              <Text style={styles.savedCheckMark}>✓</Text>
            </View>
            <Text style={styles.savedText}>Salvo na galeria.</Text>
            <Text style={styles.savedHint}>Está no app Fotos.</Text>
          </View>
        </Pressable>
      ) : null}
      {job ? <ExportProgress job={job} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  missingRoot: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 16, gap: 12 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { overflow: 'hidden', backgroundColor: colors.ground },
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
  offscreen: { position: 'absolute', left: -10000, top: 0 },
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
  trimLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  trimRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trimBar: { flex: 1 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.text, opacity: 0.8 },
  cut: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text },
  missing: { fontFamily: fonts.body, fontSize: 15, color: colors.soft, textAlign: 'center', marginTop: 40 },
});
