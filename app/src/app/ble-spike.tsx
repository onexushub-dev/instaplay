// Step 0 Bluetooth LE spike (spec docs/superpowers/specs/2026-10-23-ble-remote-design.md, section 9).
// Throwaway test screen, reached with the link repplay://ble-spike. Not the product UI.
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addReplayListener,
  bleSpike,
  ReplayCameraView,
  requestPermissions,
  startSession,
  stopSession,
} from '../../modules/replay-camera';
import type { BleSpikeStats } from '../../modules/replay-camera/src/ReplayCamera.types';
import { colors, fonts } from '../theme/tokens';

type Role = 'camera' | 'remote' | null;

function ms(value: number | undefined): string {
  return typeof value === 'number' ? `${Math.round(value)} ms` : '—';
}

export default function BleSpikeScreen() {
  const [role, setRole] = useState<Role>(null);
  const [stats, setStats] = useState<BleSpikeStats>({});
  const [lines, setLines] = useState<string[]>([]);
  const [cameraOn, setCameraOn] = useState(false);

  useEffect(() => {
    const sub = addReplayListener('onBleSpike', (e) => {
      const line = e.line;
      if (typeof line === 'string') setLines((all) => [line, ...all].slice(0, 60));
      const next = e.stats;
      if (next !== undefined) setStats((old) => Object.assign({}, old, next));
    });
    return () => {
      sub.remove();
      bleSpike.stop();
    };
  }, []);

  // The camera phone stays awake like in a game; the remote may lock, that is one of the tests.
  useEffect(() => {
    if (role !== 'camera') return;
    void activateKeepAwakeAsync('ble-spike');
    return () => void deactivateKeepAwake('ble-spike');
  }, [role]);

  useEffect(() => {
    if (!cameraOn) return;
    let live = true;
    void (async () => {
      if (!(await requestPermissions())) return;
      if (live) await startSession({ lens: 'ultraWide', maxQuality: '1080p60' });
    })();
    return () => {
      live = false;
      void stopSession();
    };
  }, [cameraOn]);

  const choose = (next: Role) => {
    setStats({});
    setLines([]);
    setRole(next);
    if (next === 'camera') bleSpike.camera();
    if (next === 'remote') bleSpike.remote();
  };

  return (
    <SafeAreaView style={styles.root}>
      {cameraOn ? <ReplayCameraView style={styles.preview} /> : null}
      <View style={styles.head}>
        <Text style={styles.title}>Teste Bluetooth (passo 0)</Text>
        <SpikeButton label="Sair" onPress={() => router.back()} />
      </View>

      {role === null ? (
        <View style={styles.row}>
          <SpikeButton label="Este é a câmera" onPress={() => choose('camera')} />
          <SpikeButton label="Este é o controle" onPress={() => choose('remote')} />
        </View>
      ) : (
        <>
          <Text style={styles.role}>{role === 'camera' ? 'Papel: câmera' : 'Papel: controle'}</Text>
          <View style={styles.card}>
            <Text style={styles.big}>{stats.connected === true ? 'CONECTADO' : 'sem conexão'}</Text>
            {role === 'camera' ? (
              <Text style={styles.stat}>{`Controles: ${stats.controllers ?? 0}`}</Text>
            ) : (
              <>
                <Text style={styles.stat}>{`Ida e volta: último ${ms(stats.rttLast)} · média ${ms(stats.rttAvg)} · máx ${ms(stats.rttMax)}`}</Text>
                <Text style={styles.stat}>{`Pings ok: ${stats.pings ?? 0} · perdidos: ${stats.lost ?? 0} · quedas: ${stats.drops ?? 0}`}</Text>
                <Text style={styles.stat}>{`Última reconexão: ${ms(stats.reconnectMs)}`}</Text>
                <Text style={styles.stat}>
                  {`Vazão: agora ${stats.kbps !== undefined ? Math.round(stats.kbps) : '—'} KB/s · média ${stats.kbpsAvg !== undefined ? Math.round(stats.kbpsAvg) : '—'} KB/s`}
                </Text>
              </>
            )}
          </View>
          <View style={styles.row}>
            {role === 'camera' ? (
              <SpikeButton label={cameraOn ? 'Desligar câmera' : 'Ligar câmera (carga real)'} onPress={() => setCameraOn(!cameraOn)} />
            ) : (
              <>
                <SpikeButton label="Medir vazão (10 s)" onPress={() => bleSpike.throughput()} />
                <SpikeButton label="Esquecer câmera" onPress={() => bleSpike.forget()} />
              </>
            )}
            <SpikeButton
              label="Trocar papel"
              onPress={() => {
                bleSpike.stop();
                setCameraOn(false);
                setRole(null);
              }}
            />
          </View>
        </>
      )}

      <ScrollView style={styles.log}>
        {lines.map((line, i) => (
          <Text key={`${i}-${line}`} style={styles.line}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SpikeButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground, paddingHorizontal: 16, gap: 12 },
  preview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.25 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.text },
  role: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.soft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 6 },
  big: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.accent },
  stat: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.accent },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onAccent },
  log: { flex: 1 },
  line: { fontFamily: fonts.body, fontSize: 12, color: colors.soft, paddingVertical: 2 },
});
