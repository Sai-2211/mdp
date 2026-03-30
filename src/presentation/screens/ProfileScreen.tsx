import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { appConfig } from '../../config/appConfig';
import { estimateChargingCost, formatMoney } from '../../core/cost';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useProfileViewModel } from '../viewModels/useProfileViewModel';
import { useAuth } from '../../context/AuthContext';

export function ProfileScreen() {
  const vm = useProfileViewModel();
  const { user } = useAuth();
  const username = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const greeting = `Hi ${username.charAt(0).toUpperCase() + username.slice(1)},`;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 28, letterSpacing: -0.5, marginBottom: 4 }}>{greeting}</Text>
        <Text style={styles.h1}>Account</Text>
      </View>

      <Card style={styles.heroCard}>
        <View style={styles.avatarWrap}>
          <Ionicons name="person" size={36} color={theme.colors.primary} />
        </View>
        <Text style={styles.heroName}>{username.charAt(0).toUpperCase() + username.slice(1)}</Text>
        <Text style={styles.heroEmail}>{vm.email}</Text>
      </Card>

      <Text style={styles.sectionTitle}>Lifetime Statistics</Text>
      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <View style={styles.statIconWrap}>
            <Ionicons name="flash" size={24} color={theme.colors.warning} />
          </View>
          <Text style={styles.statValue}>{vm.totalEnergyWh.toFixed(2)} Wh</Text>
          <Text style={styles.statLabel}>Total Energy</Text>
        </Card>
        
        <Card style={styles.statCard}>
          <View style={styles.statIconWrap}>
            <Ionicons name="cash" size={24} color={theme.colors.success} />
          </View>
          <Text style={styles.statValue}>
            {formatMoney({ amount: estimateChargingCost({ energyWh: vm.totalEnergyWh, costPerWh: appConfig.costPerWh }), currencySymbol: appConfig.currencySymbol })}
          </Text>
          <Text style={styles.statLabel}>Total Cost</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>
      <View style={styles.menuGroup}>
        <Pressable onPress={() => void vm.refresh()} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(37,99,235,0.1)' }]}>
              <Ionicons name="sync" size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.menuText}>Sync Account Data</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.muted} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable onPress={() => void vm.logout()} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
          <View style={styles.menuItemLeft}>
            <View style={[styles.menuIcon, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              <Ionicons name="log-out" size={18} color={theme.colors.danger} />
            </View>
            <Text style={styles.menuTextDanger}>Sign Out</Text>
          </View>
        </Pressable>
      </View>
      
      <Text style={styles.versionNote}>v1.0.0 • Secure Local Tokens</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: theme.spacing.lg },
  h1: { color: theme.colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  heroCard: { alignItems: 'center', paddingVertical: 32, marginBottom: theme.spacing.xl, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  avatarWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(37,99,235,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroName: { color: theme.colors.text, fontSize: 24, fontWeight: '900' },
  heroEmail: { color: theme.colors.muted, fontSize: 13, fontWeight: '700', marginTop: 2 },
  sectionTitle: { color: theme.colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  statsRow: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  statIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.card2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { color: theme.colors.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  menuGroup: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2, marginBottom: theme.spacing.xl },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff' },
  menuItemPressed: { backgroundColor: theme.colors.card2 },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuText: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  menuTextDanger: { color: theme.colors.danger, fontSize: 15, fontWeight: '800' },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: 60 },
  versionNote: { textAlign: 'center', color: theme.colors.muted, fontSize: 12, fontWeight: '700' }
});
