import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
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

function connectionTone(state: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (state === 'connected') return 'success';
  if (state === 'connecting') return 'warning';
  if (state === 'error') return 'danger';
  return 'muted';
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
  const chartWidth = Dimensions.get('window').width - theme.spacing.md * 4 - 2;

  const chart = useMemo(() => {
    if (!live.powerSeries.length) {
      return { labels: [''], datasets: [{ data: [0] }] };
    }
    const labels = live.elapsedSeries.map((s, idx) => (idx % 10 === 0 ? `${Math.floor(s)}s` : ''));
    return { labels, datasets: [{ data: live.powerSeries }] };
  }, [live.elapsedSeries, live.powerSeries]);

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

        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live Monitoring</Text>
            <View style={styles.sectionHeaderRight}>
              <StatusPill label={`WS: ${live.connectionState}`} tone={connectionTone(live.connectionState)} />
              <PrimaryButton title="Reconnect" onPress={() => void live.connect()} fullWidth={false} />
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

          <View style={{ marginTop: theme.spacing.md }}>
            <Text style={styles.chartTitle}>Power vs Time</Text>
            <View style={{ marginTop: theme.spacing.sm }}>
              <LineChart
                data={chart}
                width={chartWidth}
                height={220}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withShadow={false}
                yAxisSuffix="W"
                chartConfig={{
                  backgroundGradientFrom: theme.colors.card2,
                  backgroundGradientTo: theme.colors.card2,
                  decimalPlaces: 0,
                  color: () => theme.colors.text,
                  labelColor: () => theme.colors.muted,
                  propsForBackgroundLines: { stroke: theme.colors.border },
                }}
                bezier
                style={{ borderRadius: theme.radius.md }}
              />
            </View>
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
  grid: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chartTitle: { color: theme.colors.text, fontWeight: '900' },
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
