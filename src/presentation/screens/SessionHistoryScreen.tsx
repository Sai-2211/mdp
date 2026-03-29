import React, { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { HistoryStackParamList } from '../navigation/types';
import { appConfig } from '../../config/appConfig';
import { estimateChargingCost, formatMoney } from '../../core/cost';
import { formatDateTime, formatDuration } from '../../core/time';
import type { ChargingSession } from '../../domain/entities/session';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { LabeledValue } from '../components/LabeledValue';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useSessionHistoryViewModel } from '../viewModels/useSessionHistoryViewModel';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<HistoryStackParamList, 'SessionHistory'>;

function sessionSubtitle(s: ChargingSession): string {
  const duration = s.elapsedSeconds != null ? formatDuration(s.elapsedSeconds) : '—';
  const energy = `${s.energyWh.toFixed(2)} Wh`;
  const carbon = s.carbonSavedGrams ? `${s.carbonSavedGrams.toFixed(0)} g CO₂` : '—';
  const cost = formatMoney({
    amount: estimateChargingCost({ energyWh: s.energyWh, costPerKwh: appConfig.costPerKwh }),
    currencySymbol: appConfig.currencySymbol,
  });
  return `${duration} • ${energy} • ${carbon} • ${cost}`;
}

function profileIcon(id?: string): any {
  switch (id) {
    case 'scooter': return 'bicycle';
    case 'bike':    return 'bicycle-outline';
    case 'car':     return 'car-sport';
    case 'truck':   return 'bus';
    default:        return 'car-sport';
  }
}

function profileName(id?: string): string {
  if (!id) return '';
  switch (id) {
    case 'scooter': return 'Scooter';
    case 'bike':    return 'Bike';
    case 'car':     return 'Car';
    case 'truck':   return 'Truck';
    default:        return id.charAt(0).toUpperCase() + id.slice(1);
  }
}

export function SessionHistoryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const username = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const greeting = `Hi ${username.charAt(0).toUpperCase() + username.slice(1)},`;

  const vm = useSessionHistoryViewModel();
  const totalCost = vm.sessions.reduce(
    (sum, s) => sum + estimateChargingCost({ energyWh: s.energyWh, costPerKwh: appConfig.costPerKwh }),
    0,
  );
  const totalCarbonGrams = vm.sessions.reduce(
    (sum, s) => sum + (s.carbonSavedGrams ?? 0),
    0,
  );

  useEffect(() => {
    void vm.refresh();
  }, [vm.refresh]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 28, letterSpacing: -0.5, marginBottom: 4 }}>{greeting}</Text>
        <Text style={styles.h1}>History</Text>
      </View>

      {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
      {vm.error ? <ErrorBanner message={vm.error} /> : null}

      <Card style={{ marginTop: theme.spacing.md }}>
        <Text style={styles.sectionTitle}>Account Summary</Text>
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Total Energy" value={`${vm.totalEnergyWh.toFixed(2)} Wh`} />
          <LabeledValue label="Total Carbon Saved" value={`${totalCarbonGrams.toFixed(0)} g CO₂`} />
          <LabeledValue
            label="Total Cost"
            value={formatMoney({ amount: totalCost, currencySymbol: appConfig.currencySymbol })}
          />
          <LabeledValue label="Sessions" value={`${vm.sessions.length}`} />
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.xl, marginBottom: 4 }]}>Past Sessions</Text>

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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.itemTitle}>{formatDateTime(item.startTime)}</Text>
                  {item.profile ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(37,99,235,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                      <Ionicons name={profileIcon(item.profile)} size={12} color={theme.colors.primary} />
                      <Text style={{ fontSize: 12, color: theme.colors.primary, fontWeight: '800' }}>{profileName(item.profile)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.itemSub}>{sessionSubtitle(item)}</Text>
                {item.soc != null ? <Text style={styles.itemMeta}>SoC: {item.soc.toFixed(1)}%</Text> : null}
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
  header: { marginBottom: theme.spacing.sm },
  h1: { color: theme.colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  mock: { color: theme.colors.warning, fontWeight: '800' },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  item: { gap: 6 },
  itemTitle: { color: theme.colors.text, fontWeight: '900' },
  itemSub: { color: theme.colors.muted, fontWeight: '700' },
  itemMeta: { color: theme.colors.muted, fontWeight: '600' },
});
