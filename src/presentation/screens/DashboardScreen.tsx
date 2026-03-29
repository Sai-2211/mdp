import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, Dimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';

import { appConfig } from '../../config/appConfig';
import { estimateChargingCost, formatMoney } from '../../core/cost';
import { formatDateTime, formatDuration } from '../../core/time';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { MetricTile } from '../components/MetricTile';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { theme } from '../theme/theme';
import { useDashboardViewModel } from '../viewModels/useDashboardViewModel';
import { useRecentSessionsViewModel } from '../viewModels/useRecentSessionsViewModel';
import { useSensorData } from '../../hooks/useSensorData';
import { useAuth } from '../../context/AuthContext';

function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const BATTERY_CAPACITY_WH = Math.max(
  100,
  envNumber(process.env.EXPO_PUBLIC_BATTERY_CAPACITY_WH, 5000)
);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function connectionTone(state: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (state === 'connected') return 'success';
  if (state === 'connecting') return 'warning';
  if (state === 'error') return 'danger';
  return 'muted';
}

function AnimatedValueText({ text, style }: { text: string; style: any }) {
  // Subtle cross-fade + scale to avoid abrupt jumps.
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

function ChargingProgressRing({ batteryPercent, energyWh }: { batteryPercent: number; energyWh: number }) {
  const percent = clamp01((Number(batteryPercent) || 0) / 100);
  const energyVal = energyWh;
  const size = 184;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const dashOffset = useRef(new Animated.Value(c)).current;
  useEffect(() => {
    // Smooth progress animation; only ring and inner % text animate.
    Animated.timing(dashOffset, {
      toValue: c * (1 - percent),
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [c, dashOffset, percent]);

  const AnimatedCircle = useMemo(() => Animated.createAnimatedComponent(Circle), []);

  return (
    <Card style={styles.ringCard}>
      <Text style={styles.ringTitle}>Charging progress</Text>
      <View style={styles.ringWrap}>
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
            stroke={theme.colors.primary}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>

        <View style={styles.ringCenter}>
          <AnimatedValueText text={`${(Number(batteryPercent) || 0).toFixed(0)}%`} style={styles.ringPercent} />
          <Text style={styles.ringCaption}>Battery</Text>
        </View>
      </View>

      <Text style={styles.ringSub}>
        {energyVal.toFixed(2)} Wh of {BATTERY_CAPACITY_WH.toFixed(0)} Wh
      </Text>
      <Text style={styles.ringDisclaimer}>Estimated values • Prototype charger</Text>
    </Card>
  );
}

function profileIcon(id: string): any {
  switch (id) {
    case 'scooter': return 'bicycle';
    case 'bike':    return 'bicycle-outline';
    case 'car':     return 'car-sport';
    case 'truck':   return 'bus';
    default:        return 'car-sport';
  }
}

function profileName(id: string): string {
  switch (id) {
    case 'scooter': return 'Scooter';
    case 'bike':    return 'Bike';
    case 'car':     return 'Car';
    case 'truck':   return 'Truck';
    default:        return id.charAt(0).toUpperCase() + id.slice(1);
  }
}

function deriveChargingStatus(relay: boolean, soc: number, targetSoC: number): { label: string; tone: 'success' | 'muted' | 'warning' } {
  if (relay) return { label: 'Charging', tone: 'success' };
  if (soc >= targetSoC) return { label: 'Complete', tone: 'warning' };
  return { label: 'Idle', tone: 'muted' };
}

function SoCCard({ sensorData }: { sensorData: import('../../hooks/useSensorData').SensorData | null }) {
  const soc = sensorData?.soc ?? 0;
  const profile = sensorData?.profile ?? 'car';
  const targetSoC = sensorData?.targetSoC ?? 95;
  const relay = sensorData?.relay ?? false;

  const status = deriveChargingStatus(relay, soc, targetSoC);
  const percent = clamp01(soc / 100);

  const size = 180; // Bigger centered ring
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const dashOffset = useRef(new Animated.Value(c)).current;
  useEffect(() => {
    Animated.timing(dashOffset, {
      toValue: c * (1 - percent),
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [c, dashOffset, percent]);

  const AnimatedCircle = useMemo(() => Animated.createAnimatedComponent(Circle), []);

  return (
    <Card style={{ alignItems: 'center', paddingVertical: theme.spacing.xl, ...styles.socCard }}>
      
      {/* Centered Dial */}
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.lg }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.border} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2} cy={size / 2} r={r}
            stroke={theme.colors.success} strokeWidth={stroke} strokeLinecap="round" fill="none"
            strokeDasharray={`${c} ${c}`} strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <AnimatedValueText text={`${soc.toFixed(1)}%`} style={{ color: theme.colors.text, fontWeight: '900', fontSize: 36 }} />
          <Text style={{ color: theme.colors.muted, fontWeight: '800', marginTop: 2, fontSize: 13 }}>STATE OF CHARGE</Text>
        </View>
      </View>

      {/* Prominent Profile Badge */}
      <View style={{ 
        flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card2, 
        paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, gap: 12, marginBottom: 16 
      }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(37,99,235,0.1)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={profileIcon(profile)} size={20} color={theme.colors.primary} />
        </View>
        <View>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{profileName(profile)}</Text>
          <Text style={{ color: theme.colors.muted, fontWeight: '800', fontSize: 13 }}>Target: {targetSoC.toFixed(1)}%</Text>
        </View>
      </View>
      
      {/* Status Pill */}
      <StatusPill label={status.label} tone={status.tone} />
      
    </Card>
  );
}

function ChargingControlCard({
  state,
  online,
  loading,
  onStart,
  onStop,
  canStart,
  canStop,
}: {
  state: string;
  online: boolean;
  loading: 'start' | 'stop' | null;
  onStart: () => void;
  onStop: () => void;
  canStart: boolean;
  canStop: boolean;
}) {
  const isCharging = state === 'charging';
  
  const handlePress = () => {
    if (isCharging && canStop) {
      onStop();
    } else if (!isCharging && canStart) {
      onStart();
    }
  };

  const disabled = (!isCharging && !canStart) || (isCharging && !canStop);
  const isActionLoading = loading !== null;

  return (
    <Card style={{ padding: 0, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}>
      <Pressable 
        onPress={handlePress} 
        disabled={disabled || isActionLoading}
        style={({ pressed }) => [
          { padding: theme.spacing.xl, alignItems: 'center', justifyContent: 'center' },
          isCharging ? { backgroundColor: theme.colors.danger } : { backgroundColor: theme.colors.primary },
          pressed && { opacity: 0.85 },
          disabled && { backgroundColor: theme.colors.card2 }
        ]}
      >
        {isActionLoading ? (
          <ActivityIndicator color={isCharging ? '#fff' : '#fff'} size="large" />
        ) : (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ 
              width: 56, height: 56, borderRadius: 28, 
              backgroundColor: disabled ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.2)', 
              alignItems: 'center', justifyContent: 'center'
            }}>
              <Ionicons 
                name={isCharging ? "stop" : "flash"} 
                size={28} 
                color={disabled ? theme.colors.muted : '#fff'} 
              />
            </View>
            <Text style={{ 
              color: disabled ? theme.colors.muted : '#fff', 
              fontSize: 18, fontWeight: '900', letterSpacing: 0.5 
            }}>
              {isCharging ? 'STOP CHARGING' : online ? 'START CHARGING' : 'CHARGER OFFLINE'}
            </Text>
          </View>
        )}
      </Pressable>
    </Card>
  );
}

function PowerChartCard({ sensorData }: { sensorData: import('../../hooks/useSensorData').SensorData | null }) {
  const chartWidth = Dimensions.get('window').width - theme.spacing.md * 4 - 2;
  const powerKW = sensorData?.power ?? 0;
  
  const [data, setData] = useState<{ labels: string[]; datasets: { data: number[] }[] }>({
    labels: [''],
    datasets: [{ data: [0] }],
  });
  
  useEffect(() => {
    setData((prev) => {
      const newData = [...prev.datasets[0].data, powerKW].slice(-15);
      return { labels: newData.map(() => ''), datasets: [{ data: newData.length ? newData : [0] }] };
    });
  }, [powerKW]);

  return (
    <Card style={styles.socCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>Power Delivery</Text>
        <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{powerKW.toFixed(0)} W</Text>
      </View>
      <View style={{ marginTop: theme.spacing.sm }}>
        <LineChart
          data={data}
          width={chartWidth}
          height={160}
          withDots={false}
          withInnerLines={false}
          withOuterLines={false}
          withVerticalLabels={false}
          withHorizontalLabels={false}
          chartConfig={{
            backgroundGradientFrom: theme.colors.card2,
            backgroundGradientTo: theme.colors.card2,
            decimalPlaces: 1,
            color: (opacity = 1) => `rgba(17,24,39,${Math.min(0.65, opacity)})`,
            labelColor: () => 'rgba(0,0,0,0)',
            fillShadowGradient: theme.colors.primary,
            fillShadowGradientOpacity: 0.12,
            strokeWidth: 3,
            propsForBackgroundLines: { stroke: theme.colors.border },
          }}
          bezier
          style={{ borderRadius: theme.radius.md }}
        />
      </View>
    </Card>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const username = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const greeting = `Hi ${username.charAt(0).toUpperCase() + username.slice(1)},`;

  const vm = useDashboardViewModel();
  const recent = useRecentSessionsViewModel({ limit: 3 });
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopInFlightRef = useRef(false);
  const lastAutoStopSessionRef = useRef<string | null>(null);
  const { data: sensorData } = useSensorData();

  const canStart = useMemo(() => {
    if (!vm.status) return false;
    if (!vm.status.online) return false;
    return vm.status.state === 'idle';
  }, [vm.status]);

  const canStop = useMemo(() => {
    if (!vm.status) return false;
    return vm.status.state === 'charging';
  }, [vm.status]);

  useEffect(() => {
    void vm.refresh();
  }, [vm.refresh]);

  useEffect(() => {
    void recent.refresh();
  }, [recent.refresh]);

  useFocusEffect(
    React.useCallback(() => {
      // Keep charger status reasonably fresh on the dashboard silently.
      if (!refreshTimer.current) {
        refreshTimer.current = setInterval(() => void vm.refresh(true), 5000);
      }
      return () => {
        if (refreshTimer.current) {
          clearInterval(refreshTimer.current);
          refreshTimer.current = null;
        }
      };
    }, [vm.refresh]),
  );

  const onlineTone: 'success' | 'danger' = vm.status?.online ? 'success' : 'danger';
  const onlineLabel = vm.status?.online ? 'ONLINE' : 'OFFLINE';
  const stateLabel = (vm.status?.state ?? '—').toUpperCase();
  const stateTone: 'success' | 'warning' | 'muted' =
    vm.status?.state === 'charging' ? 'success' : vm.status?.state === 'unavailable' ? 'warning' : 'muted';

  const batteryPercent = sensorData?.soc ?? 0;
  const liveChargerState = sensorData?.relay ? 'charging' : 'idle';

  // Listen for automatic stops from the hardware
  const autoStopHandledRef = useRef<{ [key: string]: boolean }>({});
  
  useEffect(() => {
    if (!sensorData) return;
    if (sensorData.relay === true) return; // Currently charging
    if (sensorData.stopReason === 'none' || sensorData.stopReason === 'app') return;

    // ESP32 stopped it automatically due to SoC or overheat.
    const key = `${sensorData.stopReason}-${sensorData.timestamp}`;
    if (autoStopHandledRef.current[key]) return; // Already handled

    autoStopHandledRef.current[key] = true;

    // Conclude session in backend
    void vm.stop().then(() => {
      recent.refresh();
      if (sensorData.stopReason === 'soc_reached') {
        Alert.alert('Charging Complete', `Target SoC of ${sensorData.targetSoC.toFixed(1)}% reached. Charging has been safely stopped.`);
      } else if (sensorData.stopReason === 'overheat') {
        Alert.alert('⚠️ Overheat Warning', 'Battery temperature exceeded safe limits. Charging was forcefully stopped. Please check your setup.');
      }
    });

  }, [sensorData?.relay, sensorData?.stopReason, sensorData?.timestamp, vm, recent]);

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 28, letterSpacing: -0.5, marginBottom: 2 }}>{greeting}</Text>
            <Text style={{ color: theme.colors.muted, fontWeight: '800', fontSize: 13, letterSpacing: 1.5 }}>EV CHARGER</Text>
          </View>
          <Pressable onPress={() => void vm.refresh()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.refresh}>{vm.loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
        {vm.error ? <ErrorBanner message={vm.error} /> : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <View style={styles.heroPills}>
            <StatusPill label={onlineLabel} tone={onlineTone} />
            {vm.loading ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
          </View>
          <Text style={{ color: theme.colors.muted, fontWeight: '700', fontSize: 12 }}>
            {vm.status ? formatDateTime(vm.status.lastUpdated) : '—'}
          </Text>
        </View>

        {/* ── Charging Control Action (Modular) ── */}
        <ChargingControlCard 
          state={vm.status?.state ?? 'offline'}
          online={vm.status?.online ?? false}
          loading={vm.actionLoading}
          onStart={async () => { await vm.start(); await recent.refresh(); }}
          onStop={async () => { await vm.stop(); await recent.refresh(); }}
          canStart={canStart}
          canStop={canStop}
        />

        {/* ── SoC, Profile, Current Power ── */}
        <SoCCard sensorData={sensorData} />
        <PowerChartCard sensorData={sensorData} />

        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
            <Pressable onPress={() => void recent.refresh()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.refreshSmall}>{recent.loading ? 'Loading…' : 'Refresh'}</Text>
            </Pressable>
          </View>

          {recent.error ? <ErrorBanner message={recent.error} /> : null}

          <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.sm }}>
            {recent.sessions.length === 0 ? (
              <Text style={styles.empty}>No sessions yet.</Text>
            ) : (
              recent.sessions.map((s) => {
                const cost = formatMoney({
                  amount: estimateChargingCost({ energyWh: s.energyWh, costPerKwh: appConfig.costPerKwh }),
                  currencySymbol: appConfig.currencySymbol,
                });
                const duration = s.elapsedSeconds != null ? formatDuration(s.elapsedSeconds) : '—';
                return (
                  <View key={s.sessionId} style={styles.sessionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitle}>{formatDateTime(s.startTime)}</Text>
                      <Text style={styles.sessionSub}>
                        {duration} • {s.energyWh.toFixed(2)} Wh • {cost}
                      </Text>
                      <Text style={styles.sessionMeta}>Stop reason: {s.stopReason ?? '—'}</Text>
                    </View>
                    <StatusPill label={cost} tone="muted" />
                  </View>
                );
              })
            )}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  container: { gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  h1: { color: theme.colors.text, fontSize: 24, fontWeight: '900' },
  refresh: { color: theme.colors.primary, fontWeight: '800' },
  refreshSmall: { color: theme.colors.primary, fontWeight: '800' },
  mock: { color: theme.colors.warning, fontWeight: '900' },
  hero: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroPills: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  heroSub: { marginTop: theme.spacing.sm, color: theme.colors.onPrimary, fontWeight: '800' },
  heroNote: { marginTop: 8, color: theme.colors.onPrimary, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap', justifyContent: 'flex-end' },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  sectionHint: { marginTop: 6, color: theme.colors.muted, fontWeight: '700' },
  ringCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  ringTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  ringWrap: { width: 184, height: 184, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPercent: { color: theme.colors.text, fontWeight: '900', fontSize: 30 },
  ringCaption: { color: theme.colors.muted, fontWeight: '800', marginTop: 2 },
  ringSub: { color: theme.colors.muted, fontWeight: '800' },
  ringDisclaimer: { color: theme.colors.muted, fontWeight: '700', fontSize: 12 },
  grid: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  empty: { color: theme.colors.muted, fontWeight: '700' },
  sessionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  sessionTitle: { color: theme.colors.text, fontWeight: '900' },
  sessionSub: { color: theme.colors.muted, fontWeight: '800', marginTop: 4 },
  sessionMeta: { color: theme.colors.muted, fontWeight: '700', marginTop: 4 },
  socCard: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  socCardRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  socPercent: { color: theme.colors.text, fontWeight: '900', fontSize: 22 },
  socCaption: { color: theme.colors.muted, fontWeight: '800', marginTop: 2, fontSize: 12 },
  socInfoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm },
  socInfoLabel: { color: theme.colors.muted, fontWeight: '800', fontSize: 13 },
  socInfoValue: { color: theme.colors.text, fontWeight: '900', fontSize: 13 },
});
