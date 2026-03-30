import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useSessionHistoryViewModel } from '../viewModels/useSessionHistoryViewModel';
import { useAuth } from '../../context/AuthContext';

type Props = NativeStackScreenProps<HistoryStackParamList, 'SessionHistory'>;

function profileIcon(id?: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (id) {
    case 'scooter':
      return 'bicycle';
    case 'bike':
      return 'bicycle-outline';
    case 'truck':
      return 'bus';
    case 'custom':
      return 'options';
    default:
      return 'car-sport';
  }
}

function profileName(id?: string): string {
  switch (id) {
    case 'scooter':
      return 'Scooter';
    case 'bike':
      return 'Bike';
    case 'truck':
      return 'Truck';
    case 'custom':
      return 'Custom';
    case 'car':
    default:
      return 'Car';
  }
}

function stopReasonBadge(reason?: string): { label: string; bg: string; fg: string } {
  switch (reason) {
    case 'soc_reached':
      return { label: 'Complete', bg: 'rgba(16,185,129,0.14)', fg: theme.colors.success };
    case 'overheat':
      return { label: 'Overheat', bg: 'rgba(239,68,68,0.12)', fg: theme.colors.danger };
    case 'overdischarge':
      return { label: 'Low Battery', bg: 'rgba(239,68,68,0.12)', fg: theme.colors.danger };
    case 'app':
      return { label: 'Manual Stop', bg: theme.colors.card2, fg: theme.colors.muted };
    default:
      return { label: reason ? reason.replace(/_/g, ' ') : 'Unknown', bg: theme.colors.card2, fg: theme.colors.muted };
  }
}

function socText(value?: number): string {
  return value == null ? '—' : `${value.toFixed(0)}%`;
}

function EmptyState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={28} color={theme.colors.muted} />
      <Text style={styles.emptyTitle}>No charging sessions yet</Text>
      <Text style={styles.emptyMessage}>Start your first session to build charging history.</Text>
      {onRetry ? <PrimaryButton title="Refresh" onPress={onRetry} /> : null}
    </Card>
  );
}

function SessionCard({
  item,
  onPress,
}: {
  item: ChargingSession;
  onPress: () => void;
}) {
  const badge = stopReasonBadge(item.stopReason);
  const duration = item.elapsedSeconds != null ? formatDuration(item.elapsedSeconds) : '—';
  const cost = formatMoney({
    amount: estimateChargingCost({ energyWh: item.energyWh, costPerWh: appConfig.costPerWh }),
    currencySymbol: appConfig.currencySymbol,
  });

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Card style={[styles.item, { opacity: pressed ? 0.88 : 1 }]}>
          <View style={styles.itemTopRow}>
            <View style={styles.profileWrap}>
              <View style={styles.profileIconWrap}>
                <Ionicons name={profileIcon(item.profile)} size={16} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={styles.itemTitle}>{profileName(item.profile)}</Text>
                <Text style={styles.itemSub}>
                  {formatDateTime(item.startTime)} → {item.endTime ? formatDateTime(item.endTime) : '—'}
                </Text>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          </View>

          <Text style={styles.itemMeta}>{duration} • {item.energyWh.toFixed(1)} Wh • {cost}</Text>
          <View style={styles.socRow}>
            <Text style={styles.socValue}>{socText(item.startSoC)}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.muted} />
            <Text style={styles.socValue}>{socText(item.finalSoC ?? item.soc)}</Text>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

export function SessionHistoryScreen({ navigation }: Props) {
  const { user } = useAuth();
  const username = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const greeting = `Hi ${username.charAt(0).toUpperCase() + username.slice(1)},`;

  const vm = useSessionHistoryViewModel();

  useEffect(() => {
    void vm.refresh();
  }, [vm.refresh]);

  const sessions = useMemo(
    () => [...vm.sessions].sort((a, b) => b.startTime.getTime() - a.startTime.getTime()),
    [vm.sessions],
  );

  const totalCost = sessions.reduce(
    (sum, session) => sum + estimateChargingCost({ energyWh: session.energyWh, costPerWh: appConfig.costPerWh }),
    0,
  );
  const totalCarbonGrams = sessions.reduce((sum, session) => sum + (session.carbonSavedGrams ?? 0), 0);

  if (vm.loading && sessions.length === 0) {
    return (
      <Screen contentStyle={styles.centeredScreen}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.h1}>History</Text>
      </View>

      {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
      {vm.error ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ErrorBanner message={vm.error} />
          <PrimaryButton title="Retry" onPress={() => void vm.refresh()} />
        </View>
      ) : null}

      <Card style={{ marginTop: theme.spacing.md }}>
        <Text style={styles.sectionTitle}>Account Summary</Text>
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Total Energy" value={`${vm.totalEnergyWh.toFixed(1)} Wh`} />
          <LabeledValue label="Total Carbon Saved" value={`${totalCarbonGrams.toFixed(0)} g CO₂`} />
          <LabeledValue
            label="Total Cost"
            value={formatMoney({ amount: totalCost, currencySymbol: appConfig.currencySymbol })}
          />
          <LabeledValue label="Sessions" value={`${sessions.length}`} />
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { marginTop: theme.spacing.xl, marginBottom: 4 }]}>Past Sessions</Text>

      <FlatList
        style={{ marginTop: theme.spacing.sm }}
        data={sessions}
        keyExtractor={(item) => item.sessionId}
        refreshing={vm.loading}
        onRefresh={() => void vm.refresh()}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.lg }}
        renderItem={({ item }) => (
          <SessionCard
            item={item}
            onPress={() => navigation.navigate('SessionDetails', { sessionId: item.sessionId })}
          />
        )}
        ListEmptyComponent={<EmptyState onRetry={() => void vm.refresh()} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { marginBottom: theme.spacing.sm },
  greeting: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  h1: { color: theme.colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  mock: { color: theme.colors.warning, fontWeight: '800' },
  sectionTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  item: { gap: 10 },
  itemTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm },
  profileWrap: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', flex: 1 },
  profileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(37,99,235,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { color: theme.colors.text, fontWeight: '900' },
  itemSub: { color: theme.colors.muted, fontWeight: '700', marginTop: 2 },
  itemMeta: { color: theme.colors.muted, fontWeight: '700' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: { fontWeight: '900', fontSize: 12 },
  socRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  socValue: { color: theme.colors.text, fontWeight: '800' },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  emptyTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  emptyMessage: { color: theme.colors.muted, fontWeight: '700', textAlign: 'center' },
});
