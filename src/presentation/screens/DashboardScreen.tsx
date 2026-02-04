import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import type { DashboardStackParamList } from '../navigation/types';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { LabeledValue } from '../components/LabeledValue';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { formatDateTime } from '../../core/time';
import { theme } from '../theme/theme';
import { useDashboardViewModel } from '../viewModels/useDashboardViewModel';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const vm = useDashboardViewModel();
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

  const statusTone: 'success' | 'warning' | 'danger' | 'muted' = vm.status?.online
    ? vm.status.state === 'charging'
      ? 'success'
      : vm.status.state === 'unavailable'
        ? 'warning'
        : 'muted'
    : 'danger';
  const statusLabel = vm.status?.online ? 'Online' : 'Offline';

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Dashboard</Text>
        <Pressable onPress={() => void vm.refresh()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.refresh}>{vm.loading ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
      {vm.error ? <ErrorBanner message={vm.error} /> : null}

      <Card style={{ marginTop: theme.spacing.md }}>
        <View style={styles.statusRow}>
          <StatusPill label={statusLabel} tone={statusTone} />
          {vm.loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
        </View>

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Charger State" value={vm.status?.state ?? '—'} />
          <LabeledValue label="Last Updated" value={vm.status ? formatDateTime(vm.status.lastUpdated) : '—'} />
        </View>

        <View style={styles.noteWrap}>
          <Text style={styles.note}>
            Charging control is performed via secure backend authorization.
          </Text>
        </View>
      </Card>

      <View style={styles.buttons}>
        <PrimaryButton
          title="Start Charging"
          onPress={() => void vm.start()}
          disabled={!canStart}
          loading={vm.actionLoading === 'start'}
        />
        <PrimaryButton
          title="Stop Charging"
          onPress={() => void vm.stop()}
          disabled={!canStop}
          loading={vm.actionLoading === 'stop'}
          tone="danger"
        />
        <PrimaryButton
          title="Open Live Monitoring"
          onPress={() => navigation.navigate('LiveCharging')}
          disabled={!vm.status?.online}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { color: theme.colors.text, fontSize: 24, fontWeight: '900' },
  refresh: { color: theme.colors.primary, fontWeight: '800' },
  mock: { color: theme.colors.warning, fontWeight: '800', marginTop: theme.spacing.sm },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteWrap: { marginTop: theme.spacing.md, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  note: { color: theme.colors.muted, fontWeight: '600' },
  buttons: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
});
