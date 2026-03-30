import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { collection, doc, setDoc } from '@react-native-firebase/firestore';

import { getFirestoreDb } from '../../config/firebase';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { theme } from '../theme/theme';
import { useSensorData } from '../../hooks/useSensorData';

function getTimestampMs(timestamp: unknown): number | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'string') return new Date(timestamp).getTime();
  if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in (timestamp as { toDate?: () => Date }) && typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
    return (timestamp as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in (timestamp as { seconds?: number }) && typeof (timestamp as { seconds?: number }).seconds === 'number') {
    return (timestamp as { seconds: number }).seconds * 1000;
  }
  return null;
}

export function SettingsScreen() {
  const { data, loading, error } = useSensorData();

  // ── Temperature limit slider ──
  const [tempLimit, setTempLimit] = useState(40);
  const [tempSaving, setTempSaving] = useState(false);
  const hasLoadedTempLimit = useRef(false);

  useEffect(() => {
    if (hasLoadedTempLimit.current) return;
    if (typeof data?.tempLimit !== 'number' || !Number.isFinite(data.tempLimit)) return;
    setTempLimit(Math.round(data.tempLimit));
    hasLoadedTempLimit.current = true;
  }, [data?.tempLimit]);

  const saveTempLimit = async () => {
    setTempSaving(true);
    try {
      const db = getFirestoreDb();
      await setDoc(
        doc(collection(db, 'device'), 'command'),
        { tempLimit },
        { merge: true },
      );
      Alert.alert('Saved', `Temperature limit updated to ${tempLimit}°C.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setTempSaving(false);
    }
  };

  // ── ESP32 online status ──
  const isOnline = useMemo(() => {
    const lastMs = getTimestampMs(data?.timestamp);
    if (!lastMs) return false;
    return Date.now() - lastMs < 30000;
  }, [data?.timestamp]);

  const lastSeenSeconds = useMemo(() => {
    const lastMs = getTimestampMs(data?.timestamp);
    if (!lastMs) return null;
    return Math.max(0, Math.round((Date.now() - lastMs) / 1000));
  }, [data?.timestamp]);

  if (loading && !data) {
    return (
      <Screen contentStyle={styles.centeredState}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

  // ── Custom SoC target logic moved to VehicleProfileScreen ──

  return (
    <Screen>
      <Text style={styles.h1}>Settings</Text>

      {error ? <ErrorBanner message={error} /> : null}
      {!data && !loading ? (
        <Card style={styles.stateCard}>
          <Text style={styles.cardTitle}>No status yet</Text>
          <Text style={styles.hint}>The charger has not reported telemetry yet. Connect the ESP32 and try again.</Text>
        </Card>
      ) : null}

      {/* Online status */}
      <Card style={[styles.card, { marginTop: theme.spacing.md }]}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>ESP32 Status</Text>
          <StatusPill label={isOnline ? 'Online' : 'Offline'} tone={isOnline ? 'success' : 'danger'} />
        </View>
        <Text style={styles.hint}>
          {isOnline ? 'The charger is connected and sending data.' : 'Last update was more than 30 seconds ago.'}
        </Text>
        <Text style={styles.hint}>{lastSeenSeconds == null ? 'Last seen —' : `Last seen ${lastSeenSeconds} seconds ago`}</Text>
      </Card>

      {/* Temperature limit */}
      <Card style={[styles.card, { marginTop: theme.spacing.md }]}>
        <Text style={styles.cardTitle}>Temperature Limit</Text>
        <Text style={styles.hint}>Auto-stop charging above this temperature.</Text>
        <Text style={styles.hint}>Selected limit: {tempLimit.toFixed(0)}°C</Text>
        <Text style={styles.sliderValue}>{tempLimit}°C</Text>
        <View style={styles.stepperRow}>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => setTempLimit((v) => Math.max(30, v - 1))}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </Pressable>
          <View style={styles.stepperTrack}>
            <View style={[styles.stepperFill, { width: `${((tempLimit - 30) / 30) * 100}%` }]} />
          </View>
          <Pressable
            style={styles.stepperBtn}
            onPress={() => setTempLimit((v) => Math.min(60, v + 1))}
          >
            <Text style={styles.stepperBtnText}>+</Text>
          </Pressable>
        </View>
        <PrimaryButton title="Save" onPress={() => void saveTempLimit()} loading={tempSaving} />
      </Card>

      {/* End Settings cards */}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredState: { alignItems: 'center', justifyContent: 'center' },
  h1: { color: theme.colors.text, fontSize: 22, fontWeight: '900' },
  card: {
    gap: theme.spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardTitle: { color: theme.colors.text, fontWeight: '900', fontSize: 16 },
  hint: { color: theme.colors.muted, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderValue: { color: theme.colors.text, fontWeight: '900', fontSize: 28, marginTop: theme.spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    fontWeight: '800',
    fontSize: 16,
    backgroundColor: theme.colors.card2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { color: theme.colors.onPrimary, fontWeight: '900', fontSize: 20 },
  stepperTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  stepperFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  stateCard: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
});
