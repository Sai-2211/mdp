import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, Animated, Easing, ScrollView } from 'react-native';
import { getFirestore, collection, doc, setDoc } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
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
  onSelect 
}: { 
  profile: typeof profiles[number]; 
  isActive: boolean; 
  isLoading: boolean; 
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
      disabled={isLoading}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[
        styles.card,
        isActive && styles.cardActive,
        { transform: [{ scale }] }
      ]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
            <Ionicons name={profile.icon as any} size={28} color={isActive ? theme.colors.primary : theme.colors.muted} />
          </View>
          {isActive ? (
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

  const { data } = useSensorData();
  const activeProfile = data?.profile ?? 'car';
  const [pending, setPending] = useState<string | null>(null);

  const selectProfile = async (profileId: string) => {
    // Optimistic UI updates feel faster. The `pending` state covers real processing.
    setPending(profileId);
    try {
      const db = getFirestore(getApp());
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

        <View style={styles.list}>
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              isActive={activeProfile === p.id}
              isLoading={pending === p.id}
              onSelect={() => void selectProfile(p.id)}
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
