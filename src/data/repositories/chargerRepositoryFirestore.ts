import { getFirestore, collection, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';

import type { ChargerRepository, StartChargingResult } from '../../domain/repositories/chargerRepository';
import type { ChargerState, ChargerStatus } from '../../domain/entities/charger';

// We store the current "active" session document ID in-memory so stopCharging can find it.
// In a robust implementation, this would be retrieved from local storage or queried.
let activeSessionId: string | null = null;

function parseState(value: unknown): ChargerState {
  if (typeof value !== 'boolean' && typeof value !== 'string') return 'unavailable';
  // relay field: true → charging, false → idle
  if (typeof value === 'boolean') return value ? 'charging' : 'idle';
  const v = (value as string).toLowerCase();
  if (v === 'idle' || v === 'charging' || v === 'unavailable') return v;
  return 'unavailable';
}

export class ChargerRepositoryFirestore implements ChargerRepository {
  private readonly db = getFirestore(getApp());

  async getStatus(): Promise<ChargerStatus> {
    const snap = await getDoc(doc(collection(this.db, 'device'), 'status'));
    if (!snap.exists()) {
      return { online: false, state: 'unavailable', lastUpdated: new Date() };
    }
    const data = (snap.data() || {}) as any;
    console.log('[DEBUG] Firestore device/status raw data:', JSON.stringify(data));
    
    // Helper to extract value regardless of whether it's nested (from ESP32) or flat
    const extractValue = (field: any, expectedType: 'booleanValue' | 'timestampValue') => {
      if (field === undefined || field === null) return undefined;
      if (typeof field === 'object' && expectedType in field) {
        return field[expectedType];
      }
      return field;
    };

    const relay = extractValue(data.relay, 'booleanValue');
    const tsStr = extractValue(data.timestamp, 'timestampValue');
    
    // The ESP32 pushes an ISO string for timestamp, e.g. "2026-03-12T10:12:07Z"
    // Or if it's a Firestore Timestamp, it has a toDate() function
    const lastUpdated = tsStr 
      ? (typeof tsStr === 'string' ? new Date(tsStr) : (typeof tsStr.toDate === 'function' ? tsStr.toDate() : new Date()))
      : new Date();

    const online = relay !== undefined;
    const state = parseState(relay);
    return { online, state, lastUpdated };
  }

  async startCharging(): Promise<StartChargingResult> {
    // 1. Signal ESP32 to start
    await setDoc(
      doc(collection(this.db, 'device'), 'command'),
      { relay: true },
      { merge: true },
    );

    // 2. Track a new session
    const sessionsRef = collection(this.db, 'charging_sessions');
    const newSessionRef = doc(sessionsRef);
    await setDoc(newSessionRef, {
      startTime: new Date(),
      energyWh: 0,
      status: 'in_progress'
    });
    activeSessionId = newSessionRef.id;

    return { sessionId: newSessionRef.id };
  }

  async stopCharging(): Promise<void> {
    // 1. Signal ESP32 to stop
    await setDoc(
      doc(collection(this.db, 'device'), 'command'),
      { relay: false },
      { merge: true },
    );

    // 2. Terminate tracked session
    if (activeSessionId) {
      await setDoc(
        doc(collection(this.db, 'charging_sessions'), activeSessionId),
        { 
          endTime: new Date(), 
          status: 'completed',
          stopReason: 'user_stop'
        },
        { merge: true }
      );
      activeSessionId = null;
    }
  }
}
