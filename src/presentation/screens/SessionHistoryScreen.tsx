import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { HistoryStackParamList } from '../navigation/types';
import { formatDateTime, formatDuration } from '../../core/time';
import type { ChargingSession } from '../../domain/entities/session';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { LabeledValue } from '../components/LabeledValue';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useSessionHistoryViewModel } from '../viewModels/useSessionHistoryViewModel';

type Props = NativeStackScreenProps<HistoryStackParamList, 'SessionHistory'>;

function sessionSubtitle(s: ChargingSession): string {
  const duration = s.elapsedSeconds != null ? formatDuration(s.elapsedSeconds) : '—';
  const energy = `${(Number(s.energyWh) || 0).toFixed(1)} Wh`;
  return `${duration} • ${energy}`;
}

export function SessionHistoryScreen({ navigation }: Props) {
  const vm = useSessionHistoryViewModel();

  useEffect(() => {
    void vm.refresh();
  }, [vm.refresh]);

  return (
    <Screen>
      {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
      {vm.error ? <ErrorBanner message={vm.error} /> : null}

      <Card style={{ marginTop: theme.spacing.md }}>
        <Text style={styles.sectionTitle}>Account Summary</Text>
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Total Energy" value={`${vm.totalEnergyWh.toFixed(1)} Wh`} />
          <LabeledValue label="Sessions" value={`${vm.sessions.length}`} />
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.lg }]}>Session History</Text>

      <FlatList
        style={{ marginTop: theme.spacing.sm }}
        data={vm.sessions}
        keyExtractor={(item) => item.sessionId}
        refreshing={vm.loading}
        onRefresh={() => void vm.refresh()}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.lg }}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('SessionDetails', { sessionId: item.sessionId })}>
            {({ pressed }) => (
              <Card style={[styles.item, { opacity: pressed ? 0.85 : 1 }]}>
                <Text style={styles.itemTitle}>{formatDateTime(item.startTime)}</Text>
                <Text style={styles.itemSub}>{sessionSubtitle(item)}</Text>
                <Text style={styles.itemMeta}>Stop reason: {item.stopReason ?? '—'}</Text>
              </Card>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <Card style={{ marginTop: theme.spacing.md }}>
            <Text style={styles.itemTitle}>No sessions yet</Text>
            <Text style={styles.itemSub}>Start a charge to create your first session.</Text>
          </Card>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mock: { color: theme.colors.warning, fontWeight: '800' },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  item: { gap: 6 },
  itemTitle: { color: theme.colors.text, fontWeight: '900' },
  itemSub: { color: theme.colors.muted, fontWeight: '700' },
  itemMeta: { color: theme.colors.muted, fontWeight: '600' },
});
