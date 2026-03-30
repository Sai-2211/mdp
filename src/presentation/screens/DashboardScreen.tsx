import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';

import { appConfig } from '../../config/appConfig';
import { estimateChargingCost, formatMoney } from '../../core/cost';
import { formatDateTime, formatDuration } from '../../core/time';
import type { ChargingSession } from '../../domain/entities/session';
import type { SensorData, SensorTimestamp } from '../../hooks/useSensorData';
import { useSensorData } from '../../hooks/useSensorData';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../components/Card';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { theme } from '../theme/theme';
import { useDashboardViewModel } from '../viewModels/useDashboardViewModel';
import { useRecentSessionsViewModel } from '../viewModels/useRecentSessionsViewModel';

type ChargeButtonState = 'IDLE' | 'CHARGING' | 'COMPLETE' | 'LOCKED';
type SessionStopReason = 'soc_reached' | 'overheat' | 'overdischarge' | 'app' | 'none' | string;
type TelemetryTone = 'normal' | 'warning' | 'danger';
type TelemetryCardData = {
  label: string;
  value: string;
  unit: string;
  valid: boolean;
  tone: TelemetryTone;
};

function envNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const BATTERY_CAPACITY_WH = Math.max(100, envNumber(process.env.EXPO_PUBLIC_BATTERY_CAPACITY_WH, 5000));
const CHART_SAMPLE_LIMIT = 18;
const SESSION_COMPLETE_HOLD_MS = 4000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getTimestampMs(timestamp?: SensorTimestamp | Date | null): number | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'string') {
    const ms = new Date(timestamp).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().getTime();
  }
  if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp && typeof timestamp.seconds === 'number') {
    return timestamp.seconds * 1000;
  }
  return null;
}

function isDeviceOnline(timestamp?: SensorTimestamp | Date | null): boolean {
  const lastMs = getTimestampMs(timestamp);
  if (!lastMs) return false;
  return Date.now() - lastMs <= 30_000;
}

function formatLastSeen(timestamp?: SensorTimestamp | Date | null): string {
  const lastMs = getTimestampMs(timestamp);
  if (!lastMs) return 'Last seen —';
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastMs) / 1000));
  return `Last seen ${secondsAgo}s ago`;
}

function socColor(percent: number) {
  if (percent <= 20) return theme.colors.danger;
  if (percent <= 60) return theme.colors.warning;
  return theme.colors.success;
}

function temperatureTone(value: number): TelemetryTone {
  if (value > 40) return 'danger';
  if (value > 35) return 'warning';
  return 'normal';
}

function voltageTone(value: number): TelemetryTone {
  if (value < 3.0) return 'danger';
  if (value < 3.2) return 'warning';
  return 'normal';
}

function toneColor(tone: TelemetryTone): string {
  if (tone === 'danger') return theme.colors.danger;
  if (tone === 'warning') return theme.colors.warning;
  return theme.colors.text;
}

function reasonBadge(reason?: SessionStopReason): { label: string; bg: string; fg: string } {
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

function profileIcon(id: string): React.ComponentProps<typeof Ionicons>['name'] {
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

function formatSessionSoc(value?: number): string {
  return value == null ? '—' : `${value.toFixed(0)}%`;
}

function deriveChargeButtonState(
  sensorData: SensorData | null,
  uiStopReason: SessionStopReason | null,
): ChargeButtonState {
  if (sensorData?.relay) return 'CHARGING';
  if (uiStopReason === 'soc_reached') return 'COMPLETE';
  if (sensorData?.socStopActive && sensorData.stopReason !== 'soc_reached') return 'LOCKED';
  return 'IDLE';
}

function AnimatedValueText({ text, style }: { text: string; style: object }) {
  const [current, setCurrent] = useState(text);
  const [previous, setPrevious] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (text === current) return;
    setPrevious(current);
    setCurrent(text);
    anim.stopAnimation();
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPrevious(null));
  }, [anim, current, text]);

  const prevOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const nextOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const nextScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] });

  return (
    <View style={{ position: 'relative', justifyContent: 'center' }}>
      {previous ? (
        <Animated.Text style={[style, { position: 'absolute', opacity: prevOpacity }]} numberOfLines={1}>
          {previous}
        </Animated.Text>
      ) : null}
      <Animated.Text style={[style, { opacity: nextOpacity, transform: [{ scale: nextScale }] }]} numberOfLines={1}>
        {current}
      </Animated.Text>
    </View>
  );
}

function OnlineBadge({ online }: { online: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!online) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [online, pulse]);

  return (
    <View style={[styles.onlineBadge, { backgroundColor: online ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }]}>
      <Animated.View
        style={[
          styles.onlineDot,
          { backgroundColor: online ? theme.colors.success : theme.colors.danger, transform: [{ scale: pulse }] },
        ]}
      />
      <Text style={[styles.onlineText, { color: online ? theme.colors.success : theme.colors.danger }]}>
        {online ? 'ONLINE' : 'OFFLINE'}
      </Text>
    </View>
  );
}

function SoCCard({ sensorData }: { sensorData: SensorData | null }) {
  const isFault = sensorData?.faultSoC ?? false;
  const soc = isFault ? 0 : sensorData?.soc ?? 0;
  const profile = sensorData?.profile ?? 'car';
  const targetSoC = sensorData?.targetSoC ?? 95;
  const ringColor = isFault ? theme.colors.muted : socColor(soc);
  const percent = clamp01(soc / 100);

  const size = 180;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const dashOffset = useRef(new Animated.Value(circumference)).current;
  useEffect(() => {
    Animated.timing(dashOffset, {
      toValue: circumference * (1 - percent),
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [circumference, dashOffset, percent]);

  const AnimatedCircle = useMemo(() => Animated.createAnimatedComponent(Circle), []);

  return (
    <Card style={styles.socCard}>
      <View style={styles.socRingWrap}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.border} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>

        <View style={styles.socCenter}>
          {isFault ? (
            <>
              <Text style={styles.socFaultValue}>–– %</Text>
              <View style={styles.socFaultRow}>
                <Ionicons name="warning" size={14} color={theme.colors.danger} />
                <Text style={styles.socFaultLabel}>Sensor fault</Text>
              </View>
            </>
          ) : (
            <>
              <AnimatedValueText text={`${soc.toFixed(1)}%`} style={styles.socValue} />
              <Text style={styles.socLabel}>STATE OF CHARGE</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.profileBadge}>
        <View style={styles.profileIconWrap}>
          <Ionicons name={profileIcon(profile)} size={20} color={theme.colors.primary} />
        </View>
        <View>
          <Text style={styles.profileTitle}>{profileName(profile)}</Text>
          <Text style={styles.profileSubtitle}>Target: {targetSoC.toFixed(1)}%</Text>
        </View>
      </View>
    </Card>
  );
}

function TelemetryCard({ label, value, unit, valid, tone }: TelemetryCardData) {
  return (
    <View style={styles.telemetryCard}>
      <Text style={styles.telemetryLabel}>{label}</Text>
      <View style={styles.telemetryValueRow}>
        <View style={[styles.telemetryDot, { backgroundColor: valid ? theme.colors.success : theme.colors.danger }]} />
        {!valid ? <Ionicons name="warning" size={14} color={theme.colors.danger} /> : null}
        <Text style={[styles.telemetryValue, { color: valid ? toneColor(tone) : theme.colors.muted }]}>{value}</Text>
        <Text style={styles.telemetryUnit}>{unit}</Text>
      </View>
    </View>
  );
}

function TelemetryGrid({ sensorData }: { sensorData: SensorData | null }) {
  const temperatureFault = sensorData?.faultTemp ?? false;
  const voltageFault = sensorData?.faultVoltage ?? false;
  const currentFault = sensorData?.faultCurrent ?? false;
  const socFault = sensorData?.faultSoC ?? false;
  const energyWh = sensorData?.energyWh ?? 0;
  const liveCost = estimateChargingCost({ energyWh, costPerWh: appConfig.costPerWh });

  const cards: TelemetryCardData[] = [
    {
      label: 'Temperature',
      value: temperatureFault ? '––' : (sensorData?.temperature ?? 0).toFixed(1),
      unit: '°C',
      valid: !temperatureFault,
      tone: temperatureTone(sensorData?.temperature ?? 0),
    },
    {
      label: 'Voltage',
      value: voltageFault ? '––' : (sensorData?.voltage ?? 0).toFixed(2),
      unit: 'V',
      valid: !voltageFault,
      tone: voltageTone(sensorData?.voltage ?? 0),
    },
    {
      label: 'Current',
      value: currentFault ? '––' : (sensorData?.current ?? 0).toFixed(2),
      unit: 'A',
      valid: !currentFault,
      tone: 'normal',
    },
    {
      label: 'Battery',
      value: socFault ? '––' : (sensorData?.soc ?? 0).toFixed(1),
      unit: '%',
      valid: !socFault,
      tone: socFault ? 'normal' : (socColor(sensorData?.soc ?? 0) === theme.colors.danger ? 'danger' : socColor(sensorData?.soc ?? 0) === theme.colors.warning ? 'warning' : 'normal'),
    },
    {
      label: 'Energy',
      value: energyWh.toFixed(1),
      unit: 'Wh',
      valid: true,
      tone: 'normal',
    },
    {
      label: 'Cost',
      value: formatMoney({ amount: liveCost, currencySymbol: appConfig.currencySymbol }),
      unit: '',
      valid: true,
      tone: 'normal',
    },
  ];

  return (
    <Card style={styles.telemetryWrap}>
      <Text style={styles.sectionTitle}>Live telemetry</Text>
      <View style={styles.telemetryGrid}>
        {cards.map((card) => (
          <TelemetryCard key={card.label} {...card} />
        ))}
      </View>
    </Card>
  );
}

function ChargingControlCard({
  buttonState,
  loading,
  online,
  onPress,
}: {
  buttonState: ChargeButtonState;
  loading: boolean;
  online: boolean;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (buttonState !== 'COMPLETE') {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [buttonState, pulse]);

  const config = useMemo(() => {
    switch (buttonState) {
      case 'CHARGING':
        return {
          title: 'Stop Charging',
          backgroundColor: theme.colors.danger,
          textColor: theme.colors.onDanger,
          icon: 'stop-circle' as React.ComponentProps<typeof Ionicons>['name'],
          disabled: false,
          helper: 'Charging control is performed via secure backend authorization.',
        };
      case 'COMPLETE':
        return {
          title: 'Charge Again',
          backgroundColor: theme.colors.success,
          textColor: theme.colors.onPrimary,
          icon: 'refresh-circle' as React.ComponentProps<typeof Ionicons>['name'],
          disabled: true,
          helper: 'Session saved. Preparing charger for the next session…',
        };
      case 'LOCKED':
        return {
          title: 'Charging Complete',
          backgroundColor: theme.colors.card2,
          textColor: theme.colors.muted,
          icon: 'lock-closed' as React.ComponentProps<typeof Ionicons>['name'],
          disabled: true,
          helper: 'The charger is locked after a protected stop.',
        };
      case 'IDLE':
      default:
        return {
          title: 'Start Charging',
          backgroundColor: online ? theme.colors.primary : theme.colors.card2,
          textColor: online ? theme.colors.onPrimary : theme.colors.muted,
          icon: 'flash' as React.ComponentProps<typeof Ionicons>['name'],
          disabled: !online,
          helper: online
            ? 'Charging control is performed via secure backend authorization.'
            : 'Bring the charger online to start a new session.',
        };
    }
  }, [buttonState, online]);

  const borderColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.75)'],
  });

  return (
    <Animated.View style={[styles.actionOuter, buttonState === 'COMPLETE' ? { borderColor, borderWidth: 2 } : null]}>
      <Pressable
        onPress={onPress}
        disabled={config.disabled || loading}
        style={({ pressed }) => [
          styles.actionButton,
          {
            backgroundColor: config.backgroundColor,
            opacity: config.disabled || loading ? 0.72 : pressed ? 0.88 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={config.textColor} size="large" />
        ) : (
          <View style={styles.actionContent}>
            <Ionicons name={config.icon} size={28} color={config.textColor} />
            <Text style={[styles.actionTitle, { color: config.textColor }]}>{config.title}</Text>
            <Text style={[styles.actionHelper, { color: config.textColor }]}>{config.helper}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function PowerChartCard({ sensorData }: { sensorData: SensorData | null }) {
  const chartWidth = Dimensions.get('window').width - theme.spacing.md * 4 - 2;
  const power = sensorData?.power ?? 0;
  const [data, setData] = useState<{ labels: string[]; datasets: { data: number[] }[] }>({
    labels: [''],
    datasets: [{ data: [0] }],
  });

  useEffect(() => {
    setData((previous) => {
      const nextValues = [...previous.datasets[0].data, power].slice(-CHART_SAMPLE_LIMIT);
      return {
        labels: nextValues.map(() => ''),
        datasets: [{ data: nextValues.length ? nextValues : [0] }],
      };
    });
  }, [power]);

  return (
    <Card style={styles.chartCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Power delivery</Text>
        <Text style={styles.chartPower}>{power.toFixed(1)} W</Text>
      </View>
      <View style={{ marginTop: theme.spacing.sm }}>
        <LineChart
          data={data}
          width={chartWidth}
          height={160}
          withDots={false}
          withInnerLines={false}
          withOuterLines={false}
          withVerticalLabels={false}
          withHorizontalLabels={false}
          chartConfig={{
            backgroundGradientFrom: theme.colors.card2,
            backgroundGradientTo: theme.colors.card2,
            decimalPlaces: 1,
            color: (opacity = 1) => `rgba(17,24,39,${Math.min(0.7, opacity)})`,
            labelColor: () => 'rgba(0,0,0,0)',
            fillShadowGradient: theme.colors.primary,
            fillShadowGradientOpacity: 0.12,
            strokeWidth: 3,
            propsForBackgroundLines: { stroke: theme.colors.border },
          }}
          bezier
          style={{ borderRadius: theme.radius.md }}
        />
      </View>
    </Card>
  );
}

function RecentSessionCard({ session }: { session: ChargingSession }) {
  const reason = reasonBadge(session.stopReason);
  const cost = formatMoney({
    amount: estimateChargingCost({ energyWh: session.energyWh, costPerWh: appConfig.costPerWh }),
    currencySymbol: appConfig.currencySymbol,
  });
  const duration = session.elapsedSeconds != null ? formatDuration(session.elapsedSeconds) : '—';

  return (
    <View style={styles.sessionRow}>
      <View style={styles.sessionIconWrap}>
        <Ionicons name={profileIcon(session.profile ?? 'car')} size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionTitle}>{profileName(session.profile)}</Text>
        <Text style={styles.sessionSub}>
          {formatDateTime(session.startTime)} → {session.endTime ? formatDateTime(session.endTime) : '—'}
        </Text>
        <Text style={styles.sessionMeta}>
          {duration} • {session.energyWh.toFixed(1)} Wh • {cost}
        </Text>
      </View>
      <View style={[styles.reasonBadge, { backgroundColor: reason.bg }]}>
        <Text style={[styles.reasonText, { color: reason.fg }]}>{reason.label}</Text>
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card style={styles.emptyState}>
      <Ionicons name={icon} size={28} color={theme.colors.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? <PrimaryButton title={actionLabel} onPress={onAction} /> : null}
    </Card>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const username = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const greeting = `Hi ${username.charAt(0).toUpperCase() + username.slice(1)},`;

  const vm = useDashboardViewModel();
  const recent = useRecentSessionsViewModel({ limit: 3 });
  const { data: sensorData, loading: sensorLoading } = useSensorData();
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uiStopReason, setUiStopReason] = useState<SessionStopReason | null>(null);

  useEffect(() => {
    void vm.refresh();
  }, [vm.refresh]);

  useEffect(() => {
    void recent.refresh();
  }, [recent.refresh]);

  useFocusEffect(
    React.useCallback(() => {
      if (!refreshTimer.current) {
        refreshTimer.current = setInterval(() => void vm.refresh(true), 5000);
      }
      return () => {
        if (refreshTimer.current) {
          clearInterval(refreshTimer.current);
          refreshTimer.current = null;
        }
      };
    }, [vm.refresh]),
  );

  useEffect(() => {
    if (sensorData?.relay) {
      if (completionResetTimer.current) {
        clearTimeout(completionResetTimer.current);
        completionResetTimer.current = null;
      }
      setUiStopReason(null);
      return;
    }

    if (sensorData?.stopReason === 'soc_reached') {
      setUiStopReason('soc_reached');
      return;
    }

    if (sensorData?.stopReason && sensorData.stopReason !== 'none' && sensorData.stopReason !== 'app') {
      if (completionResetTimer.current) {
        clearTimeout(completionResetTimer.current);
        completionResetTimer.current = null;
      }
      setUiStopReason(sensorData.stopReason);
      return;
    }

    if (!completionResetTimer.current) {
      setUiStopReason(null);
    }
  }, [sensorData?.relay, sensorData?.stopReason]);

  useEffect(() => {
    if (uiStopReason !== 'soc_reached') {
      if (completionResetTimer.current) {
        clearTimeout(completionResetTimer.current);
        completionResetTimer.current = null;
      }
      return;
    }

    // Keep the completion state visible briefly, then return the CTA
    // to a fresh "Start Charging" action for the next session.
    completionResetTimer.current = setTimeout(() => {
      completionResetTimer.current = null;
      setUiStopReason(null);
    }, SESSION_COMPLETE_HOLD_MS);

    return () => {
      if (completionResetTimer.current) {
        clearTimeout(completionResetTimer.current);
        completionResetTimer.current = null;
      }
    };
  }, [uiStopReason]);

  const online = isDeviceOnline(sensorData?.timestamp ?? vm.status?.lastUpdated ?? null);
  const buttonState = deriveChargeButtonState(sensorData ?? null, uiStopReason);

  const handleAction = async () => {
    try {
      if (buttonState === 'CHARGING') {
        await vm.stop();
        setUiStopReason('app');
      } else if (buttonState === 'IDLE') {
        setUiStopReason(null);
        await vm.start();
      }
      await recent.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      Alert.alert('Action failed', message);
    }
  };

  const sortedSessions = useMemo(
    () => [...recent.sessions].sort((a, b) => b.startTime.getTime() - a.startTime.getTime()),
    [recent.sessions],
  );

  const initialLoading = (vm.loading && !vm.status) || (sensorLoading && !sensorData);
  const initialError = !sensorData && !vm.status && vm.error;

  if (initialLoading) {
    return (
      <Screen contentStyle={styles.centeredScreen}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </Screen>
    );
  }

  if (initialError) {
    return (
      <Screen contentStyle={styles.centeredScreen}>
        <EmptyState
          icon="alert-circle-outline"
          title="Unable to load dashboard"
          message={vm.error ?? 'Something went wrong while loading the charger.'}
          actionLabel="Retry"
          onAction={() => void vm.refresh()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.headerSubtitle}>EV CHARGER</Text>
          </View>
          <Pressable onPress={() => void vm.refresh()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.refresh}>{vm.loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {vm.backendMode === 'mock' ? <Text style={styles.mock}>Mock mode enabled</Text> : null}
        {vm.error ? <ErrorBanner message={vm.error} /> : null}

        <View style={styles.statusRow}>
          <OnlineBadge online={online} />
          <Text style={styles.lastSeen}>{formatLastSeen(sensorData?.timestamp ?? vm.status?.lastUpdated ?? null)}</Text>
        </View>

        <ChargingControlCard
          buttonState={buttonState}
          loading={vm.actionLoading !== null}
          online={online}
          onPress={() => void handleAction()}
        />

        {sensorData ? (
          <>
            <SoCCard sensorData={sensorData} />
            <TelemetryGrid sensorData={sensorData} />
            <PowerChartCard sensorData={sensorData} />
          </>
        ) : (
          <EmptyState
            icon="hardware-chip-outline"
            title="Waiting for charger telemetry"
            message="Once the ESP32 posts live status, the dashboard cards will appear here."
            actionLabel="Refresh"
            onAction={() => void vm.refresh()}
          />
        )}

        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
            <Pressable onPress={() => void recent.refresh()} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
              <Text style={styles.refresh}>{recent.loading ? 'Loading…' : 'Refresh'}</Text>
            </Pressable>
          </View>

          {recent.error ? (
            <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
              <ErrorBanner message={recent.error} />
              <PrimaryButton title="Retry" onPress={() => void recent.refresh()} />
            </View>
          ) : recent.loading && sortedSessions.length === 0 ? (
            <View style={styles.sectionCentered}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : sortedSessions.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="No charging sessions yet"
              message="Start your first session to see charging history here."
            />
          ) : (
            <View style={styles.sessionsList}>
              {sortedSessions.map((session) => (
                <RecentSessionCard key={session.sessionId} session={session} />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centeredScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    color: theme.colors.primary,
    fontWeight: '900',
    fontSize: 28,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  headerSubtitle: {
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  refresh: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  mock: {
    color: theme.colors.warning,
    fontWeight: '900',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  onlineDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  onlineText: {
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  lastSeen: {
    color: theme.colors.muted,
    fontWeight: '700',
    fontSize: 12,
  },
  actionOuter: {
    borderRadius: theme.radius.lg,
  },
  actionButton: {
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  actionContent: {
    alignItems: 'center',
    gap: 8,
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: '900',
  },
  actionHelper: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  socCard: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  socRingWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  socValue: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 36,
  },
  socLabel: {
    color: theme.colors.muted,
    fontWeight: '800',
    marginTop: 2,
    fontSize: 13,
  },
  socFaultValue: {
    color: theme.colors.muted,
    fontWeight: '900',
    fontSize: 34,
  },
  socFaultRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  socFaultLabel: {
    color: theme.colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card2,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 12,
  },
  profileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(37,99,235,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },
  profileSubtitle: {
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 13,
  },
  telemetryWrap: {
    gap: theme.spacing.md,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  telemetryCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: theme.colors.card2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 8,
  },
  telemetryLabel: {
    color: theme.colors.muted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  telemetryValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  telemetryDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  telemetryValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  telemetryUnit: {
    color: theme.colors.muted,
    fontWeight: '800',
    paddingTop: 2,
  },
  chartCard: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },
  chartPower: {
    color: theme.colors.primary,
    fontWeight: '900',
  },
  sessionsList: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  sessionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(37,99,235,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionTitle: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  sessionSub: {
    color: theme.colors.muted,
    fontWeight: '700',
    marginTop: 2,
  },
  sessionMeta: {
    color: theme.colors.muted,
    fontWeight: '700',
    marginTop: 4,
  },
  reasonBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  reasonText: {
    fontWeight: '900',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: '900',
    fontSize: 16,
  },
  emptyMessage: {
    color: theme.colors.muted,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
});
