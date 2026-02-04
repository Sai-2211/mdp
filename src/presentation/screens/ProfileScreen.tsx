import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { appConfig } from '../../config/appConfig';
import { estimateChargingCost, formatMoney } from '../../core/cost';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { LabeledValue } from '../components/LabeledValue';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useProfileViewModel } from '../viewModels/useProfileViewModel';

export function ProfileScreen() {
  const vm = useProfileViewModel();

  return (
    <Screen>
      {vm.error ? <ErrorBanner message={vm.error} /> : null}

      <Card style={{ marginTop: theme.spacing.md }}>
        <View style={styles.row}>
          <Text style={styles.title}>Account</Text>
          {vm.loading ? <ActivityIndicator color={theme.colors.primary} /> : null}
        </View>

        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <LabeledValue label="Email" value={vm.email} />
          <LabeledValue label="Backend Mode" value={vm.backendMode} />
          <LabeledValue label="Total Energy" value={`${vm.totalEnergyWh.toFixed(1)} Wh`} />
          <LabeledValue
            label="Total Cost"
            value={formatMoney({
              amount: estimateChargingCost({ energyWh: vm.totalEnergyWh, costPerKwh: appConfig.costPerKwh }),
              currencySymbol: appConfig.currencySymbol,
            })}
          />
        </View>

        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
          <PrimaryButton title="Refresh" onPress={() => void vm.refresh()} />
          <PrimaryButton title="Logout" onPress={() => void vm.logout()} tone="danger" />
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.lg }}>
        <Text style={styles.note}>
          Tokens are stored securely on-device. Expired tokens force re-login automatically.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
  note: { color: theme.colors.muted, fontWeight: '600' },
});
