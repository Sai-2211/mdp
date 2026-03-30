import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@react-native-firebase/firestore';

import { getFirestoreDb } from '../../config/firebase';
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

function extractValue<T>(field: unknown, expectedType: string, fallback: T): T {
  if (field === undefined || field === null) return fallback;
  if (typeof field === 'object' && field !== null && expectedType in (field as Record<string, unknown>)) {
    return ((field as Record<string, unknown>)[expectedType] as T | undefined) ?? fallback;
  }
  return field as T;
}

function toDateValue(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds: number }).seconds === 'number') {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return new Date();
}

export class ChargerRepositoryFirestore implements ChargerRepository {
  private get db() {
    return getFirestoreDb();
  }

  async getStatus(): Promise<ChargerStatus> {
    const snap = await getDoc(doc(collection(this.db, 'device'), 'status'));
    if (!snap.exists()) {
      return { online: false, state: 'unavailable', lastUpdated: new Date() };
    }
    const data = (snap.data() || {}) as Record<string, unknown>;
    const relay = extractValue<boolean | string | undefined>(data.relay, 'booleanValue', undefined);
    const timestampValue = extractValue<unknown>(data.timestamp, 'timestampValue', null);
    const lastUpdated = toDateValue(timestampValue);
    const online = Date.now() - lastUpdated.getTime() <= 30_000;
    const state = parseState(relay);
    return { online, state, lastUpdated };
  }

  async startCharging(): Promise<StartChargingResult> {
    const statusSnap = await getDoc(doc(collection(this.db, 'device'), 'status'));
    const statusData = (statusSnap.data() || {}) as Record<string, unknown>;
    const startSoC = Number(extractValue(statusData.soc, 'doubleValue', 0));
    const profile = String(extractValue(statusData.profile, 'stringValue', 'car'));

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
      status: 'active',
      stopReason: 'none',
      profile,
      startSoC,
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

    // 2. Fetch latest telemetry from device/status
    const snap = await getDoc(doc(collection(this.db, 'device'), 'status'));
    let additionalData: {
      energyWh?: number;
      elapsedSeconds?: number;
      stopReason?: string;
      soc?: number;
      finalSoC?: number;
      profile?: string;
      carbonSavedGrams?: number;
    } = {};
    if (snap.exists()) {
      const data = (snap.data() || {}) as Record<string, unknown>;
      const energyWh = Number(extractValue(data.energyWh, 'doubleValue', 0));
      const elapsed = Number(extractValue(data.elapsedSeconds, 'integerValue', 0));
      const rawStopReason = String(extractValue(data.stopReason, 'stringValue', 'app'));
      const stopReason =
        rawStopReason === 'none' || rawStopReason.trim() === '' ? 'app' : rawStopReason;
      const soc = Number(extractValue(data.soc, 'doubleValue', 0));
      const profile = String(extractValue(data.profile, 'stringValue', 'car'));
      
      const carbonSavedGrams = energyWh * 0.8;
      
      additionalData = {
        energyWh,
        elapsedSeconds: elapsed,
        stopReason,
        soc,
        finalSoC: soc,
        profile,
        carbonSavedGrams
      };
    }

    // 3. Terminate tracked session
    if (activeSessionId) {
        const payload: Record<string, unknown> = { 
          endTime: serverTimestamp(), 
          status: 'completed',
        };
        
        if (additionalData.energyWh !== undefined) payload.energyWh = additionalData.energyWh;
        if (additionalData.elapsedSeconds !== undefined) payload.elapsedSeconds = additionalData.elapsedSeconds;
        if (additionalData.stopReason !== undefined) payload.stopReason = additionalData.stopReason;
        if (additionalData.soc !== undefined) payload.soc = additionalData.soc;
        if (additionalData.finalSoC !== undefined) payload.finalSoC = additionalData.finalSoC;
        if (additionalData.profile !== undefined) payload.profile = additionalData.profile;
        if (additionalData.carbonSavedGrams !== undefined) payload.carbonSavedGrams = additionalData.carbonSavedGrams;

        await setDoc(
          doc(collection(this.db, 'charging_sessions'), activeSessionId),
          payload,
          { merge: true }
        );
        activeSessionId = null;
    } else {
      // 4. Recovery: Check if there's a stale active session
      const q = query(collection(this.db, 'charging_sessions'), where('status', '==', 'active'), orderBy('startTime', 'desc'), limit(1));
      const staleSnap = await getDocs(q);
      if (!staleSnap.empty) {
         const staleDocRef = staleSnap.docs[0].ref;
         
         const payload: Record<string, unknown> = {
           endTime: serverTimestamp(),
           status: 'completed',
         };
         if (additionalData.energyWh !== undefined) payload.energyWh = additionalData.energyWh;
         if (additionalData.elapsedSeconds !== undefined) payload.elapsedSeconds = additionalData.elapsedSeconds;
         if (additionalData.stopReason !== undefined) payload.stopReason = additionalData.stopReason;
         if (additionalData.soc !== undefined) payload.soc = additionalData.soc;
         if (additionalData.finalSoC !== undefined) payload.finalSoC = additionalData.finalSoC;
         if (additionalData.profile !== undefined) payload.profile = additionalData.profile;
         if (additionalData.carbonSavedGrams !== undefined) payload.carbonSavedGrams = additionalData.carbonSavedGrams;

         await setDoc(staleDocRef, payload, { merge: true });
      }
    }
  }
}
