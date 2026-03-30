import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, Animated, Easing, ScrollView, TextInput } from 'react-native';
import { collection, doc, setDoc } from '@react-native-firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

import { getFirestoreDb } from '../../config/firebase';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { theme } from '../theme/theme';
import { useSensorData } from '../../hooks/useSensorData';
import { useAuth } from '../../context/AuthContext';

const profiles = [
  { id: 'scooter', label: 'Scooter', target: 60, rate: 'Slow Phase', icon: 'bicycle' },
  { id: 'bike', label: 'Bike', target: 80, rate: 'Medium Phase', icon: 'bicycle-outline' },
  { id: 'car', label: 'Car', target: 95, rate: 'Fast DC', icon: 'car-sport' },
  { id: 'truck', label: 'Truck', target: 100, rate: 'Max Output', icon: 'bus' },
] as const;

function ProfileCard({ 
  profile, 
  isActive, 
  isLoading, 
  isLocked,
  onSelect 
}: { 
  profile: typeof profiles[number]; 
  isActive: boolean; 
  isLoading: boolean; 
  isLocked: boolean;
  onSelect: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, { toValue: 0.97, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  };

  return (
    <Pressable
      onPress={onSelect}
      disabled={isLoading || isLocked}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[
        styles.card,
        isActive && styles.cardActive,
        isLocked && styles.cardLocked,
        { transform: [{ scale }] }
      ]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
            <Ionicons name={profile.icon as any} size={28} color={isActive ? theme.colors.primary : theme.colors.muted} />
          </View>
          {isLocked ? (
            <View style={styles.lockPill}>
              <Ionicons name="lock-closed" size={14} color={theme.colors.muted} />
              <Text style={styles.lockText}>Locked</Text>
            </View>
          ) : isActive ? (
            <View style={styles.activePill}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={styles.activeText}>Active</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.label, isActive && styles.labelActive]}>{profile.label}</Text>
          <Text style={styles.targetText}>Target SoC Limit: {profile.target}%</Text>
        </View>

        <View style={styles.cardFooter}>
          <View style={[styles.rateBadge, isActive && styles.rateBadgeActive]}>
            <Ionicons name="flash" size={12} color={isActive ? '#fff' : theme.colors.muted} style={{ marginRight: 4 }} />
            <Text style={[styles.rateText, isActive && styles.rateTextActive]}>{profile.rate}</Text>
          </View>
          {isLoading && isActive ? <Text style={styles.loadingText}>Syncing…</Text> : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

export function VehicleProfileScreen() {
  const { user } = useAuth();
  const username = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const greeting = `Hi ${username.charAt(0).toUpperCase() + username.slice(1)},`;

  const { data, loading, error } = useSensorData();
  const activeProfile = data?.profile ?? 'car';
  const currentTargetStr = data?.targetSoC?.toString() ?? '95';
  const [pending, setPending] = useState<string | null>(null);
  const [customTarget, setCustomTarget] = useState(currentTargetStr);
  const isChargingActive = data?.relay ?? false;

  if (loading && !data) {
    return (
      <Screen contentStyle={styles.centeredState}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

  const saveCustomTarget = async () => {
    const value = Number(customTarget);
    if (!Number.isFinite(value) || value < 1 || value > 100) {
      Alert.alert('Invalid', 'Enter a number between 1 and 100.');
      return;
    }
    setPending('custom');
    try {
      const db = getFirestoreDb();
      await setDoc(
        doc(collection(db, 'device'), 'command'),
        { profile: 'custom', targetSoC: value },
        { merge: true },
      );
      await setDoc(
        doc(collection(db, 'device'), 'status'),
        { profile: 'custom', targetSoC: value },
        { merge: true },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save custom target';
      Alert.alert('Error', msg);
    } finally {
      setPending(null);
    }
  };

  const selectProfile = async (profileId: string) => {
    // Optimistic UI updates feel faster. The `pending` state covers real processing.
    setPending(profileId);
    try {
      const db = getFirestoreDb();
      const target = profiles.find(p => p.id === profileId)?.target ?? 95;

      // 1. Issue command to the hardware (ESP32 Source of Truth)
      await setDoc(
        doc(collection(db, 'device'), 'command'),
        { profile: profileId, targetSoC: target },
        { merge: true },
      );

      // 2. Immediately overwrite device/status so the App doesn't "bounce" while waiting for ESP32 echo
      await setDoc(
        doc(collection(db, 'device'), 'status'),
        { profile: profileId, targetSoC: target },
        { merge: true },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to set profile';
      Alert.alert('Error', msg);
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 28, letterSpacing: -0.5, marginBottom: 4 }}>{greeting}</Text>
          <Text style={styles.h1}>Charging Profiles</Text>
          <Text style={styles.subtitle}>
            Select your vehicle layout to optimize the charging curve and set the Target SoC limit automatically.
          </Text>
        </View>

        {error ? <ErrorBanner message={error} /> : null}
        {!data && !loading ? (
          <Card style={styles.stateCard}>
            <Ionicons name="car-outline" size={26} color={theme.colors.muted} />
            <Text style={styles.stateTitle}>No charger profile data yet</Text>
            <Text style={styles.stateText}>Once the charger reports telemetry, the active profile will appear here.</Text>
          </Card>
        ) : null}
        {isChargingActive ? (
          <Card style={styles.lockedBanner}>
            <Ionicons name="lock-closed" size={18} color={theme.colors.warning} />
            <Text style={styles.lockedBannerText}>Profile switching is disabled while charging is active.</Text>
          </Card>
        ) : null}

        <View style={styles.list}>
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              isActive={activeProfile === p.id}
              isLoading={pending === p.id}
              isLocked={isChargingActive}
              onSelect={() => void selectProfile(p.id)}
            />
          ))}
          
          <View style={styles.card}>
            <Text style={[styles.label, { fontSize: 20 }]}>Custom Targeting</Text>
            <Text style={styles.targetText}>Set a precise custom SoC shutoff target (override).</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
              <TextInput
                style={styles.input}
                value={customTarget}
                onChangeText={setCustomTarget}
                placeholder="e.g. 80"
                placeholderTextColor={theme.colors.muted}
                keyboardType="numeric"
                maxLength={3}
              />
              <Pressable
                style={styles.saveBtn}
                disabled={pending === 'custom' || isChargingActive}
                onPress={() => void saveCustomTarget()}
              >
                <Text style={styles.saveBtnText}>
                  {pending === 'custom' ? 'Saving...' : isChargingActive ? 'Locked' : 'Set Target'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredState: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: theme.spacing.xl },
  header: { marginBottom: theme.spacing.xl },
  h1: { color: theme.colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: theme.colors.muted, fontWeight: '600', fontSize: 16, marginTop: 8, lineHeight: 22 },
  list: { gap: theme.spacing.md },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(29, 78, 216, 0.03)',
  },
  cardLocked: {
    opacity: 0.72,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.card2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16
  },
  iconWrapActive: { backgroundColor: 'rgba(29, 78, 216, 0.1)' },
  activePill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.primary,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 4
  },
  activeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  lockText: { color: theme.colors.muted, fontWeight: '800', fontSize: 12 },
  cardBody: { marginBottom: 16 },
  label: { fontSize: 24, fontWeight: '900', color: theme.colors.text },
  labelActive: { color: theme.colors.primary },
  targetText: { fontSize: 14, color: theme.colors.muted, fontWeight: '700', marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card2,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12
  },
  rateBadgeActive: { backgroundColor: theme.colors.primary },
  rateText: { color: theme.colors.muted, fontWeight: '800', fontSize: 13 },
  rateTextActive: { color: '#fff' },
  loadingText: { color: theme.colors.primary, fontWeight: '800', fontSize: 13 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 16,
    backgroundColor: theme.colors.card2,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 16 },
  stateCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  stateTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  stateText: { color: theme.colors.muted, fontWeight: '700', textAlign: 'center' },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: theme.spacing.md,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.30)',
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  lockedBannerText: { color: theme.colors.text, fontWeight: '700', flex: 1 },
});
