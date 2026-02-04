import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme/theme';

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
}) {
  const bg =
    tone === 'success'
      ? 'rgba(45,212,191,0.16)'
      : tone === 'warning'
        ? 'rgba(245,158,11,0.16)'
        : tone === 'danger'
          ? 'rgba(255,107,107,0.16)'
          : 'rgba(168,177,199,0.16)';
  const border =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.border;

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  text: { color: theme.colors.text, fontWeight: '700', fontSize: 12 },
});

