import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { formatDuration } from '../../core/time';
import { ApiError, NetworkError } from '../../core/errors';
import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { useRepositories } from '../state/RepositoriesContext';
import { theme } from '../theme/theme';

type UiChargerState = 'idle' | 'charging' | 'finished';

function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const CHART_WINDOW_SECONDS = envNumber(process.env.EXPO_PUBLIC_CHART_WINDOW_SECONDS, 45);
const CHART_SMOOTHING_SAMPLES = envNumber(process.env.EXPO_PUBLIC_CHART_SMOOTHING_N, 10);
const BATTERY_CAPACITY_WH = envNumber(process.env.EXPO_PUBLIC_BATTERY_CAPACITY_WH, 50);

type LiveConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

type LiveChargingTelemetry = {
  voltage: number;
  current: number;
  power: number;
  energyWh: number;
  elapsedSeconds: number;
  batteryPercent: number;
  chargerState: 'idle' | 'charging' | 'finished';
};

type LiveChargingRepository = {
  connect(): Promise<void>;
  disconnect(): void;
  getConnectionState(): LiveConnectionState;
  onConnectionStateChange(listener: (state: LiveConnectionState) => void): () => void;
  subscribe(listener: (data: LiveChargingTelemetry) => void): () => void;
};

type StoreSnapshot = {
  connectionState: LiveConnectionState;
  telemetry: LiveChargingTelemetry | null;
  dataWarning: boolean;
};

function errorToMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return 'Backend unavailable. Check your connection.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function connectionTone(state: LiveConnectionState): 'success' | 'warning' | 'danger' | 'muted' {
  if (state === 'connected') return 'success';
  if (state === 'connecting') return 'warning';
  if (state === 'error') return 'danger';
  return 'muted';
}

function deriveUiChargerState(t: LiveChargingTelemetry | null): UiChargerState {
  if (!t) return 'idle';
  if (t.chargerState === 'charging') return 'charging';
  if (t.chargerState === 'finished') return 'finished';
  // UI-only heuristic to represent "finished" even if backend maps it to idle in the stream.
  if (t.batteryPercent >= 99.5 && t.energyWh > 0) return 'finished';
  return 'idle';
}

function isValidTelemetry(t: LiveChargingTelemetry): boolean {
  // Defensive UI validation: keep last valid UI values if stream data is invalid.
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!t || typeof t !== 'object') return false;
  if (!n(t.voltage) || t.voltage < 0) return false;
  if (!n(t.current) || t.current < 0) return false;
  if (!n(t.power) || t.power < 0) return false;
  if (!n(t.energyWh) || t.energyWh < 0) return false;
  if (!n(t.elapsedSeconds) || t.elapsedSeconds < 0) return false;
  if (!n(t.batteryPercent) || t.batteryPercent < 0 || t.batteryPercent > 100) return false;
  if (t.chargerState !== 'idle' && t.chargerState !== 'charging' && t.chargerState !== 'finished') return false;
  return true;
}

/**
 * Store + scoped subscriptions:
 * - WebSocket updates can be frequent.
 * - We keep a small store and use `useSyncExternalStore` selectors so only the widgets that
 *   read a value re-render (the whole screen does not rebuild on every message).
 */
class LiveChargingStore {
  private snapshot: StoreSnapshot;
  private readonly listeners = new Set<() => void>();
  private unsubTelemetry: (() => void) | null = null;
  private unsubConnection: (() => void) | null = null;
  private started = false;

  constructor(private readonly repo: LiveChargingRepository) {
    this.snapshot = { connectionState: repo.getConnectionState(), telemetry: null, dataWarning: false };
  }

  start() {
    if (this.started) return;
    this.started = true;

    // Connect once; socket layer handles auto-reconnect.
    void this.repo.connect();

    this.unsubConnection = this.repo.onConnectionStateChange((state) => {
      if (this.snapshot.connectionState === state) return;
      this.setSnapshot({ ...this.snapshot, connectionState: state });
    });

    this.unsubTelemetry = this.repo.subscribe((t) => {
      if (!isValidTelemetry(t)) {
        if (!this.snapshot.dataWarning) {
          this.setSnapshot({ ...this.snapshot, dataWarning: true });
        }
        return;
      }
      this.setSnapshot({ connectionState: this.snapshot.connectionState, telemetry: t, dataWarning: false });
    });
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.unsubTelemetry?.();
    this.unsubConnection?.();
    this.unsubTelemetry = null;
    this.unsubConnection = null;
    this.repo.disconnect();
  }

  reconnect() {
    this.repo.disconnect();
    void this.repo.connect();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private setSnapshot(next: StoreSnapshot) {
    const prev = this.snapshot;
    this.snapshot = next;
    // Avoid needless notifications for identical snapshots.
    if (
      prev.connectionState === next.connectionState &&
      prev.telemetry === next.telemetry &&
      prev.dataWarning === next.dataWarning
    ) {
      return;
    }
    for (const listener of this.listeners) listener();
  }
}

function useStoreSelector<T>(store: LiveChargingStore, selector: (s: StoreSnapshot) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()), () => selector(store.getSnapshot()));
}

/**
 * Animation helper:
 * - Cross-fades between old/new values with a subtle scale-in.
 * - Avoids flashing or aggressive effects.
 */
function AnimatedValueText({
  text,
  style,
}: {
  text: string;
  style: any;
}) {
  const [current, setCurrent] = useState(text);
  const [previous, setPrevious] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (text === current) return;
    setPrevious(current);
    setCurrent(text);

    anim.stopAnimation();
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPrevious(null));
  }, [anim, current, text]);

  const prevOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const nextOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const nextScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });

  return (
    <View style={{ position: 'relative', justifyContent: 'center' }}>
      {previous != null ? (
        <Animated.Text style={[style, { position: 'absolute', opacity: prevOpacity }]} numberOfLines={1}>
          {previous}
        </Animated.Text>
      ) : null}
      <Animated.Text style={[style, { opacity: nextOpacity, transform: [{ scale: nextScale }] }]} numberOfLines={1}>
        {current}
      </Animated.Text>
    </View>
  );
}

function ValueWithUnit({
  valueText,
  unit,
}: {
  valueText: string;
  unit: string;
}) {
  return (
    <View style={styles.valueRow}>
      <AnimatedValueText text={valueText} style={styles.valueText} />
      <Text style={styles.unitText}>{unit}</Text>
    </View>
  );
}

function SecondaryMetric({
  label,
  valueText,
  unit,
}: {
  label: string;
  valueText: string;
  unit: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueRow}>
        <AnimatedValueText text={valueText} style={styles.metricValue} />
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function BatteryProgressRing({ store }: { store: LiveChargingStore }) {
  const batteryPercent = useStoreSelector(store, (s) => s.telemetry?.batteryPercent ?? 0);
  const energyWh = useStoreSelector(store, (s) => s.telemetry?.energyWh ?? 0);

  const percentText = `${batteryPercent.toFixed(0)}%`;
  const progress = clamp01(batteryPercent / 100);

  const size = 152;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const dashOffset = useRef(new Animated.Value(c)).current;
  useEffect(() => {
    // Smooth ring progress animation.
    Animated.timing(dashOffset, {
      toValue: c * (1 - progress),
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [c, dashOffset, progress]);

  const AnimatedCircle = useMemo(() => Animated.createAnimatedComponent(Circle), []);

  return (
    <View style={styles.ringWrap}>
      <View style={styles.ring}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={theme.colors.border}
            strokeWidth={stroke}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={theme.colors.success}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <AnimatedValueText text={percentText} style={styles.ringPercent} />
          <Text style={styles.ringCaption}>Battery</Text>
        </View>
      </View>
      <Text style={styles.ringSub}>
        {energyWh.toFixed(1)} Wh of {Number.isFinite(BATTERY_CAPACITY_WH) ? BATTERY_CAPACITY_WH.toFixed(1) : '—'} Wh
      </Text>
    </View>
  );
}

function ChargerStateHeader({ store }: { store: LiveChargingStore }) {
  const connectionState = useStoreSelector(store, (s) => s.connectionState);
  const telemetry = useStoreSelector(store, (s) => s.telemetry);
  const dataWarning = useStoreSelector(store, (s) => s.dataWarning);

  const uiState = deriveUiChargerState(telemetry);

  const stateConfig = useMemo(() => {
    if (uiState === 'charging') {
      return {
        label: 'Charging',
        icon: 'flash',
        tone: theme.colors.success,
        bg: 'rgba(16,185,129,0.10)',
      } as const;
    }
    if (uiState === 'finished') {
      return {
        label: 'Finished',
        icon: 'checkmark-circle',
        tone: theme.colors.primary,
        bg: 'rgba(249,200,0,0.20)',
      } as const;
    }
    return { label: 'Idle', icon: 'pause', tone: theme.colors.muted, bg: theme.colors.card2 } as const;
  }, [uiState]);

  const connectionLabel =
    connectionState === 'connected'
      ? null
      : connectionState === 'connecting'
        ? 'Reconnecting…'
        : connectionState === 'error'
          ? 'Connection error'
          : 'Disconnected';

  return (
    <View style={styles.headerBlock}>
      <View style={styles.headerTopRow}>
        <View style={[styles.stateBadge, { backgroundColor: stateConfig.bg, borderColor: stateConfig.tone }]}>
          <Ionicons name={stateConfig.icon as any} size={18} color={stateConfig.tone} />
          <Text style={styles.stateText}>{stateConfig.label}</Text>
        </View>
        <View style={styles.headerRight}>
          {dataWarning ? (
            <View style={styles.warningPill}>
              <Ionicons name="warning" size={16} color={theme.colors.warning} />
              <Text style={styles.warningText}>Telemetry issue</Text>
            </View>
          ) : null}
          {connectionLabel ? <StatusPill label={connectionLabel} tone={connectionTone(connectionState)} /> : null}
        </View>
      </View>
      <Text style={styles.sessionLabel}>Session authenticated</Text>
    </View>
  );
}

function ChargingControls({ store }: { store: LiveChargingStore }) {
  const { chargerRepository } = useRepositories();
  const telemetry = useStoreSelector(store, (s) => s.telemetry);
  const uiState = deriveUiChargerState(telemetry);

  const [pending, setPending] = useState<'start' | 'stop' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canStart = uiState !== 'charging' && pending == null;
  const canStop = uiState === 'charging' && pending == null;

  const onStart = async () => {
    setPending('start');
    setError(null);
    try {
      // Charging control is performed via secure backend authorization.
      await chargerRepository.startCharging();
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setPending(null);
    }
  };

  const onStop = async () => {
    setPending('stop');
    setError(null);
    try {
      // Charging control is performed via secure backend authorization.
      await chargerRepository.stopCharging();
    } catch (e) {
      setError(errorToMessage(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      {error ? <Text style={styles.controlError}>{error}</Text> : null}
      <PrimaryButton title="Start charging" onPress={() => void onStart()} disabled={!canStart} loading={pending === 'start'} tone="dark" />
      <PrimaryButton title="Stop charging" onPress={() => void onStop()} disabled={!canStop} loading={pending === 'stop'} tone="danger" />
    </View>
  );
}

function PrimaryPowerBlock({ store }: { store: LiveChargingStore }) {
  const power = useStoreSelector(store, (s) => s.telemetry?.power ?? 0);
  const voltage = useStoreSelector(store, (s) => s.telemetry?.voltage ?? 0);
  const current = useStoreSelector(store, (s) => s.telemetry?.current ?? 0);
  const energyWh = useStoreSelector(store, (s) => s.telemetry?.energyWh ?? 0);
  const elapsedSeconds = useStoreSelector(store, (s) => s.telemetry?.elapsedSeconds ?? 0);

  const kw = power / 1000;

  return (
    <Card style={styles.cardShadow}>
      <Text style={styles.sectionTitle}>Live</Text>

      <View style={{ marginTop: theme.spacing.md }}>
        <Text style={styles.primaryLabel}>Power</Text>
        <View style={{ marginTop: 6 }}>
          <ValueWithUnit valueText={power.toFixed(1)} unit="W" />
        </View>
        <Text style={styles.speedLabel}>Charging speed ≈ {kw.toFixed(2)} kW</Text>
      </View>

      <View style={styles.metricsRow}>
        <SecondaryMetric label="Voltage" valueText={voltage.toFixed(1)} unit="V" />
        <SecondaryMetric label="Current" valueText={current.toFixed(2)} unit="A" />
      </View>

      <View style={styles.metricsRow}>
        <SecondaryMetric label="Energy" valueText={energyWh.toFixed(1)} unit="Wh" />
        <SecondaryMetric label="Time" valueText={formatDuration(elapsedSeconds)} unit="" />
      </View>
    </Card>
  );
}

type Sample = { t: number; power: number };

function movingAverage(values: number[], windowSize: number): number[] {
  // UI-only smoothing: moving average used only for drawing the chart.
  const n = Math.max(1, Math.floor(windowSize));
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - n + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j];
    out.push(sum / (i - start + 1));
  }
  return out;
}

function PowerChartCard({ store }: { store: LiveChargingStore }) {
  const chartWidth = Dimensions.get('window').width - theme.spacing.md * 4 - 2;

  const [data, setData] = useState<{ labels: string[]; datasets: { data: number[] }[] }>({
    labels: [''],
    datasets: [{ data: [0] }],
  });

  const samplesRef = useRef<Sample[]>([]);
  const lastEmitAtRef = useRef(0);
  const windowMs = Math.max(30, Math.min(60, CHART_WINDOW_SECONDS)) * 1000;
  const smoothingN = Math.max(8, Math.min(12, CHART_SMOOTHING_SAMPLES));

  useEffect(() => {
    const unsub = store.subscribe(() => {
      const t = store.getSnapshot().telemetry;
      if (!t) return;
      const now = Date.now();

      samplesRef.current.push({ t: now, power: t.power });
      // Rolling window: keep only recent samples (UI only).
      samplesRef.current = samplesRef.current.filter((s) => now - s.t <= windowMs);

      // Throttle chart updates to reduce noise and improve performance.
      if (now - lastEmitAtRef.current < 500) return;
      lastEmitAtRef.current = now;

      const powers = samplesRef.current.map((s) => s.power);
      const smoothed = movingAverage(powers, smoothingN);
      const labels = smoothed.map(() => '');

      setData({ labels, datasets: [{ data: smoothed.length ? smoothed : [0] }] });
    });

    return () => unsub();
  }, [store, smoothingN, windowMs]);

  return (
    <Card style={[styles.cardShadow, { marginTop: theme.spacing.md }]}>
      <View style={styles.chartHeader}>
        <Text style={styles.sectionTitle}>Power (last {Math.round(windowMs / 1000)}s)</Text>
        <PrimaryButton
          title="Clear"
          onPress={() => {
            samplesRef.current = [];
            setData({ labels: [''], datasets: [{ data: [0] }] });
          }}
          fullWidth={false}
        />
      </View>
      <View style={{ marginTop: theme.spacing.sm }}>
        <LineChart
          data={data}
          width={chartWidth}
          height={160}
          withDots={false}
          withInnerLines={false}
          withOuterLines={false}
          withShadow
          withVerticalLabels={false}
          withHorizontalLabels={false}
          chartConfig={{
            backgroundGradientFrom: theme.colors.card2,
            backgroundGradientTo: theme.colors.card2,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(17,24,39,${Math.min(0.65, opacity)})`,
            labelColor: () => 'rgba(0,0,0,0)',
            fillShadowGradient: theme.colors.primary,
            fillShadowGradientOpacity: 0.12,
            strokeWidth: 3,
            linejoinType: 'round',
            propsForBackgroundLines: { stroke: theme.colors.border },
            propsForLabels: { fontSize: 0 },
          }}
          bezier
          style={{ borderRadius: theme.radius.md }}
        />
      </View>
    </Card>
  );
}

export function LiveChargingScreen() {
  const { liveChargingRepository } = useRepositories();
  const storeRef = useRef<LiveChargingStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new LiveChargingStore(liveChargingRepository as any);
  }
  const store = storeRef.current;

  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);

  const connectionState = useStoreSelector(store, (s) => s.connectionState);

  return (
    <Screen>
      <Card style={styles.cardShadow}>
        <View style={styles.topRow}>
          <Text style={styles.title}>Live Charging</Text>
          <PrimaryButton
            title="Reconnect"
            onPress={() => store.reconnect()}
            fullWidth={false}
            disabled={connectionState === 'connecting'}
          />
        </View>

        <ChargerStateHeader store={store} />

        <View style={styles.progressRow}>
          <BatteryProgressRing store={store} />
          <View style={{ flex: 1 }}>
            <ChargingControls store={store} />
          </View>
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.md }}>
        <PrimaryPowerBlock store={store} />
      </View>

      <PowerChartCard store={store} />

      <View style={{ marginTop: theme.spacing.lg }}>
        <Text style={styles.footnote}>Estimated values • Prototype charger</Text>
        <Text style={[styles.footnote, { marginTop: 6 }]}>
          Live values are streamed from the backend (`/charging/live`). Charging control is authorized by the backend.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
  headerBlock: { marginTop: theme.spacing.md, gap: 10 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  stateText: { color: theme.colors.text, fontWeight: '900' },
  sessionLabel: { color: theme.colors.muted, fontWeight: '700' },
  warningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    backgroundColor: 'rgba(245,158,11,0.10)',
  },
  warningText: { color: theme.colors.text, fontWeight: '800', fontSize: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.md },
  ringWrap: { alignItems: 'center' },
  ring: { width: 152, height: 152, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPercent: { color: theme.colors.text, fontWeight: '900', fontSize: 28 },
  ringCaption: { color: theme.colors.muted, fontWeight: '800', marginTop: 2 },
  ringSub: { marginTop: 10, color: theme.colors.muted, fontWeight: '700' },
  controlError: { color: theme.colors.danger, fontWeight: '800' },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 14, textTransform: 'uppercase' },
  primaryLabel: { color: theme.colors.muted, fontWeight: '800' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  valueText: { color: theme.colors.text, fontWeight: '900', fontSize: 34 },
  unitText: { color: theme.colors.muted, fontWeight: '800', fontSize: 14, paddingBottom: 5 },
  speedLabel: { color: theme.colors.muted, fontWeight: '700', marginTop: 6 },
  metricsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  metric: {
    flex: 1,
    backgroundColor: theme.colors.card2,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 6,
  },
  metricLabel: { color: theme.colors.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  metricValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  metricValue: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
  metricUnit: { color: theme.colors.muted, fontWeight: '800', paddingBottom: 1 },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  footnote: { color: theme.colors.muted, fontWeight: '700' },
});
