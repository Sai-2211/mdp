import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { HistoryStackParamList } from '../navigation/types';
import { appConfig } from '../../config/appConfig';
import { estimateChargingCost, formatMoney } from '../../core/cost';
import { formatDateTime, formatDuration } from '../../core/time';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { LabeledValue } from '../components/LabeledValue';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useSessionDetailsViewModel } from '../viewModels/useSessionDetailsViewModel';

type Props = NativeStackScreenProps<HistoryStackParamList, 'SessionDetails'>;

export function SessionDetailsScreen({ route }: Props) {
  const { sessionId } = route.params;
  const vm = useSessionDetailsViewModel(sessionId);

  if (vm.loading && !vm.session) {
    return (
      <Screen contentStyle={styles.centeredScreen}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen>
      {vm.error ? (
        <View style={{ gap: theme.spacing.sm }}>
          <ErrorBanner message={vm.error} />
          <PrimaryButton title="Retry" onPress={() => void vm.refresh()} />
        </View>
      ) : null}

      {!vm.session && !vm.loading ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={28} color={theme.colors.muted} />
          <Text style={styles.emptyTitle}>Session not found</Text>
          <Text style={styles.emptyText}>We could not load the details for this charging session.</Text>
          <PrimaryButton title="Retry" onPress={() => void vm.refresh()} />
        </Card>
      ) : null}

      {vm.session ? (
      <Card style={{ marginTop: theme.spacing.md }}>
        <View style={styles.row}>
          <Text style={styles.title}>Session</Text>
          {vm.loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
        </View>
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Session ID" value={vm.session?.sessionId ?? sessionId} />
          <LabeledValue label="Start" value={vm.session ? formatDateTime(vm.session.startTime) : '—'} />
          <LabeledValue label="End" value={vm.session?.endTime ? formatDateTime(vm.session.endTime) : '—'} />
          <LabeledValue
            label="Duration"
            value={vm.session?.elapsedSeconds != null ? formatDuration(vm.session.elapsedSeconds) : '—'}
          />
          <LabeledValue label="Energy" value={vm.session ? `${vm.session.energyWh.toFixed(2)} Wh` : '—'} />
          <LabeledValue
            label="Cost"
            value={
              vm.session
                ? formatMoney({
                    amount: estimateChargingCost({ energyWh: vm.session.energyWh, costPerWh: appConfig.costPerWh }),
                    currencySymbol: appConfig.currencySymbol,
                  })
                : '—'
            }
          />
          <LabeledValue label="Stop reason" value={vm.session?.stopReason ?? '—'} />
          <LabeledValue label="Start SoC" value={vm.session?.startSoC != null ? `${vm.session.startSoC.toFixed(0)}%` : '—'} />
          <LabeledValue label="Final SoC" value={vm.session?.finalSoC != null ? `${vm.session.finalSoC.toFixed(0)}%` : vm.session?.soc != null ? `${vm.session.soc.toFixed(0)}%` : '—'} />
          <LabeledValue label="Profile" value={vm.session?.profile ?? '—'} />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <PrimaryButton title="Refresh" onPress={() => void vm.refresh()} />
        </View>
      </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredScreen: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
  emptyCard: { marginTop: theme.spacing.md, alignItems: 'center', gap: theme.spacing.sm },
  emptyTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  emptyText: { color: theme.colors.muted, fontWeight: '700', textAlign: 'center' },
});
