import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { HistoryStackParamList } from '../navigation/types';
import { appConfig } from '../../config/appConfig';
import { energyWhToKwh, estimateChargingCost, formatMoney } from '../../core/cost';
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

  return (
    <Screen>
      {vm.error ? <ErrorBanner message={vm.error} /> : null}

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
          <LabeledValue label="Energy" value={vm.session ? `${energyWhToKwh(vm.session.energyWh).toFixed(2)} kWh` : '—'} />
          <LabeledValue
            label="Cost"
            value={
              vm.session
                ? formatMoney({
                    amount: estimateChargingCost({ energyWh: vm.session.energyWh, costPerKwh: appConfig.costPerKwh }),
                    currencySymbol: appConfig.currencySymbol,
                  })
                : '—'
            }
          />
          <LabeledValue label="Stop reason" value={vm.session?.stopReason ?? '—'} />
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <PrimaryButton title="Refresh" onPress={() => void vm.refresh()} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
});
