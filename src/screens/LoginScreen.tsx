import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { signIn, signUp, signInWithGoogle, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }
    const res = await signIn(email.trim(), password);
    if (res) setLocalError(res);
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }
    const res = await signUp(email.trim(), password);
    if (!res) {
      Alert.alert('Account created', 'You are now signed in.');
    } else {
      setLocalError(res);
    }
  };

  const errText = localError ?? error;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>EV Charger Login</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.hint}>Format: user@example.com</Text>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#64748b" />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Password must be at least 6 characters</Text>

        {loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
        {errText ? <Text style={styles.error}>{errText}</Text> : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={handleSignIn}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={handleSignUp}>
            <Text style={styles.buttonText}>Create Account</Text>
          </TouchableOpacity>
          
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={[styles.button, styles.googleButton]} onPress={signInWithGoogle}>
            <Ionicons name="logo-google" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f7fb', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a', marginBottom: 20, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 4,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 16, marginLeft: 4 },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeIcon: { paddingHorizontal: 12 },
  actions: { marginTop: 4, gap: 12 },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1d4ed8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondary: { backgroundColor: '#0f172a' },
  googleButton: { backgroundColor: '#ea4335' },
  buttonText: {
    fontWeight: '800',
    color: '#fff',
    fontSize: 16,
  },
  error: { color: '#ef4444', fontWeight: '700', marginVertical: 8, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 12, color: '#64748b', fontWeight: '600', fontSize: 13 },
});
