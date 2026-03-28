import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getFirestore, collection, doc, setDoc } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';

import { Card } from '../components/Card';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { theme } from '../theme/theme';
import { useSensorData } from '../../hooks/useSensorData';

export function SettingsScreen() {
  const { data } = useSensorData();

  // ── Temperature limit slider ──
  const [tempLimit, setTempLimit] = useState(40);
  const [tempSaving, setTempSaving] = useState(false);

  const saveTempLimit = async () => {
    setTempSaving(true);
    try {
      const db = getFirestore(getApp());
      await setDoc(
        doc(collection(db, 'device'), 'command'),
        { tempLimit },
        { merge: true },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setTempSaving(false);
    }
  };

  // ── ESP32 online status ──
  const isOnline = useMemo(() => {
    if (!data?.timestamp) return false;
    const ts = data.timestamp;
    let lastMs: number;
    if (typeof ts === 'string') {
      lastMs = new Date(ts).getTime();
    } else if (ts && typeof (ts as any).toDate === 'function') {
      lastMs = (ts as any).toDate().getTime();
    } else if (ts && typeof (ts as any).seconds === 'number') {
      lastMs = (ts as any).seconds * 1000;
    } else {
      return false;
    }
    return Date.now() - lastMs < 30000;
  }, [data?.timestamp]);

  // ── Custom SoC target ──
  const [customTarget, setCustomTarget] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);

  const saveCustomTarget = async () => {
    const value = Number(customTarget);
    if (!Number.isFinite(value) || value < 1 || value > 100) {
      Alert.alert('Invalid', 'Enter a number between 1 and 100.');
      return;
    }
    setTargetSaving(true);
    try {
      const db = getFirestore(getApp());
      await setDoc(
        doc(collection(db, 'device'), 'command'),
        { customTarget: value },
        { merge: true },
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setTargetSaving(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.h1}>Settings</Text>

      {/* Online status */}
      <Card style={[styles.card, { marginTop: theme.spacing.md }]}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>ESP32 Status</Text>
          <StatusPill label={isOnline ? 'Online' : 'Offline'} tone={isOnline ? 'success' : 'danger'} />
        </View>
        <Text style={styles.hint}>
          {isOnline ? 'The charger is connected and sending data.' : 'Last update was more than 30 seconds ago.'}
        </Text>
      </Card>

      {/* Temperature limit */}
      <Card style={[styles.card, { marginTop: theme.spacing.md }]}>
        <Text style={styles.cardTitle}>Temperature Limit</Text>
        <Text style={styles.hint}>Auto-stop charging above this temperature.</Text>
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

      {/* Custom SoC target */}
      <Card style={[styles.card, { marginTop: theme.spacing.md }]}>
        <Text style={styles.cardTitle}>Custom SoC Target</Text>
        <Text style={styles.hint}>Override the profile target with a custom value (1–100%).</Text>
        <TextInput
          style={styles.input}
          value={customTarget}
          onChangeText={setCustomTarget}
          placeholder="e.g. 80"
          placeholderTextColor={theme.colors.muted}
          keyboardType="numeric"
          maxLength={3}
        />
        <PrimaryButton title="Save" onPress={() => void saveCustomTarget()} loading={targetSaving} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
