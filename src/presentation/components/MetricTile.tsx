import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme/theme';

export function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 140,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    padding: theme.spacing.md,
    gap: 6,
  },
  label: { color: theme.colors.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  value: { color: theme.colors.text, fontWeight: '900', fontSize: 18 },
  hint: { color: theme.colors.muted, fontWeight: '700', fontSize: 12 },
});

