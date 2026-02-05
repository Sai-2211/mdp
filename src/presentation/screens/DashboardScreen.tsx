import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';

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
import { useLiveChargingViewModel } from '../viewModels/useLiveChargingViewModel';
import { useRecentSessionsViewModel } from '../viewModels/useRecentSessionsViewModel';

function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const BATTERY_CAPACITY_WH = envNumber(process.env.EXPO_PUBLIC_BATTERY_CAPACITY_WH, 50);

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
        {(Number(energyWh) || 0).toFixed(1)} Wh of {BATTERY_CAPACITY_WH.toFixed(0)} Wh
      </Text>
      <Text style={styles.ringDisclaimer}>Estimated values • Prototype charger</Text>
    </Card>
  );
}

export function DashboardScreen() {
  const vm = useDashboardViewModel();
  const live = useLiveChargingViewModel({ autoConnect: true });
  const recent = useRecentSessionsViewModel({ limit: 3 });
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      // Keep charger status reasonably fresh on the dashboard.
      if (!refreshTimer.current) {
        refreshTimer.current = setInterval(() => void vm.refresh(), 5000);
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

  const latest = live.latest;

  const currentCost = latest
    ? formatMoney({
        amount: estimateChargingCost({ energyWh: latest.energyWh, costPerKwh: appConfig.costPerKwh }),
        currencySymbol: appConfig.currencySymbol,
      })
    : '—';

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Mini EV Charger</Text>
          <Pressable onPress={() => void vm.refresh()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.refresh}>{vm.loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
        {vm.error ? <ErrorBanner message={vm.error} /> : null}

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroPills}>
              <StatusPill label={onlineLabel} tone={onlineTone} />
              <StatusPill label={stateLabel} tone={stateTone} />
            </View>
            {vm.loading ? <ActivityIndicator color={theme.colors.onPrimary} /> : null}
          </View>

          <Text style={styles.heroSub}>Last updated: {vm.status ? formatDateTime(vm.status.lastUpdated) : '—'}</Text>
          <Text style={styles.heroNote}>Charging control is performed via secure backend authorization.</Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
            <PrimaryButton
              title="Start Charging"
              onPress={async () => {
                await vm.start();
                await recent.refresh();
              }}
              disabled={!canStart}
              loading={vm.actionLoading === 'start'}
              tone="dark"
            />
            <PrimaryButton
              title="Stop Charging"
              onPress={async () => {
                await vm.stop();
                await recent.refresh();
              }}
              disabled={!canStop}
              loading={vm.actionLoading === 'stop'}
              tone="danger"
            />
  	        </View>
  	      </View>

        <ChargingProgressRing batteryPercent={latest?.batteryPercent ?? 0} energyWh={latest?.energyWh ?? 0} />

  	      <Card>
  	        <View style={styles.sectionHeader}>
  	          <Text style={styles.sectionTitle}>Live Monitoring</Text>
  	          <View style={styles.sectionHeaderRight}>
  	            <StatusPill label={`WS: ${live.connectionState}`} tone={connectionTone(live.connectionState)} />
  	          </View>
  	        </View>

          <Text style={styles.sectionHint}>
            Rate: {appConfig.currencySymbol}
            {appConfig.costPerKwh.toFixed(2)}/kWh
          </Text>

  	          <View style={styles.grid}>
  	            <MetricTile label="Voltage" value={latest ? `${latest.voltage.toFixed(1)} V` : '—'} />
  	            <MetricTile label="Current" value={latest ? `${latest.current.toFixed(2)} A` : '—'} />
  	            <MetricTile label="Power" value={latest ? `${latest.power.toFixed(0)} W` : '—'} />
  	            <MetricTile label="Energy" value={latest ? `${latest.energyWh.toFixed(1)} Wh` : '—'} />
  	            <MetricTile label="Battery" value={latest ? `${latest.batteryPercent.toFixed(0)}%` : '—'} />
  	            <MetricTile label="Elapsed" value={latest ? formatDuration(latest.elapsedSeconds) : '—'} />
  	            <MetricTile label="Session" value={latest?.sessionId ? latest.sessionId : '—'} hint="Backend session id" />
  	            <MetricTile label="Cost (est)" value={currentCost} hint="Based on energy received" />
  	          </View>
  	      </Card>

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
                        {duration} • {(Number(s.energyWh) || 0).toFixed(1)} Wh • {cost}
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
});
