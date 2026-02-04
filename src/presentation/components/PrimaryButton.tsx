import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../theme/theme';

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  tone = 'primary',
  fullWidth = true,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'primary' | 'danger' | 'dark';
  fullWidth?: boolean;
}) {
  const bg =
    tone === 'danger' ? theme.colors.danger : tone === 'dark' ? theme.colors.dark : theme.colors.primary;
  const fg =
    tone === 'danger' ? theme.colors.onDanger : tone === 'dark' ? theme.colors.onDark : theme.colors.onPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        fullWidth ? styles.fullWidth : styles.compact,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.title, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  fullWidth: { width: '100%' },
  compact: { alignSelf: 'flex-start' },
  title: { fontWeight: '800', fontSize: 16 },
});
