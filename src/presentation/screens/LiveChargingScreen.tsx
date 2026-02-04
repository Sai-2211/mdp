import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { formatDuration } from '../../core/time';
import { Card } from '../components/Card';
import { LabeledValue } from '../components/LabeledValue';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { theme } from '../theme/theme';
import { useLiveChargingViewModel } from '../viewModels/useLiveChargingViewModel';

function connectionTone(state: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (state === 'connected') return 'success';
  if (state === 'connecting') return 'warning';
  if (state === 'error') return 'danger';
  return 'muted';
}

export function LiveChargingScreen() {
  const vm = useLiveChargingViewModel({ autoConnect: true });

  const chartWidth = Dimensions.get('window').width - theme.spacing.md * 4 - 2;

  const chart = useMemo(() => {
    if (!vm.powerSeries.length) {
      return { labels: [''], datasets: [{ data: [0] }] };
    }

    const labels = vm.elapsedSeries.map((s, idx) => {
      if (idx === 0) return '0s';
      return idx % 10 === 0 ? `${Math.floor(s)}s` : '';
    });

    return { labels, datasets: [{ data: vm.powerSeries }] };
  }, [vm.elapsedSeries, vm.powerSeries]);

  const latest = vm.latest;

  return (
    <Screen>
      <Card>
        <View style={styles.row}>
          <StatusPill
            label={`WebSocket: ${vm.connectionState}`}
            tone={connectionTone(vm.connectionState)}
          />
          <PrimaryButton title="Reconnect" onPress={() => void vm.connect()} fullWidth={false} />
        </View>

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Charger State" value={latest?.chargerState ?? '—'} />
          <LabeledValue label="Session ID" value={latest?.sessionId ?? '—'} />
          <LabeledValue label="Elapsed" value={latest ? formatDuration(latest.elapsedSeconds) : '—'} />
        </View>
      </Card>

      <Card style={{ marginTop: theme.spacing.md }}>
        <Text style={styles.sectionTitle}>Live Telemetry</Text>
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Voltage (V)" value={latest ? latest.voltage.toFixed(1) : '—'} />
          <LabeledValue label="Current (A)" value={latest ? latest.current.toFixed(2) : '—'} />
          <LabeledValue label="Power (W)" value={latest ? latest.power.toFixed(0) : '—'} />
          <LabeledValue label="Energy (Wh)" value={latest ? latest.energyWh.toFixed(1) : '—'} />
          <LabeledValue label="Battery (%)" value={latest ? `${latest.batteryPercent.toFixed(0)}%` : '—'} />
        </View>
      </Card>

      <Card style={{ marginTop: theme.spacing.md }}>
        <View style={styles.row}>
          <Text style={styles.sectionTitle}>Power vs Time</Text>
          <PrimaryButton title="Clear" onPress={vm.clearSeries} fullWidth={false} />
        </View>
        <View style={{ marginTop: theme.spacing.md }}>
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
              color: () => theme.colors.primary,
              labelColor: () => theme.colors.muted,
              propsForBackgroundLines: { stroke: theme.colors.border },
            }}
            bezier
            style={{ borderRadius: theme.radius.md }}
          />
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.lg }}>
        <Text style={styles.footnote}>
          Live values are streamed from the backend (`/charging/live`). The app displays values as received.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  footnote: { color: theme.colors.muted, fontWeight: '600' },
});
