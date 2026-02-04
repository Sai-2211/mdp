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
  tone?: 'primary' | 'danger';
  fullWidth?: boolean;
}) {
  const bg = tone === 'danger' ? theme.colors.danger : theme.colors.primary;
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
      {loading ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.title}>{title}</Text>}
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
  title: { color: theme.colors.text, fontWeight: '700', fontSize: 16 },
});
