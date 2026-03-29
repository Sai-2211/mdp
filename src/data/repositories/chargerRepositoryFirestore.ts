import { getFirestore, collection, doc, getDoc, setDoc, query, where, getDocs, orderBy, limit } from '@react-native-firebase/firestore';
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
      status: 'in_progress',
      stopReason: 'none'
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
    let additionalData: Record<string, any> = {};
    if (snap.exists()) {
      const data = snap.data() || {};
      const ext = (field: any, type: string) => (field && typeof field === 'object' && type in field) ? field[type] : field;
      const energyWh = ext(data.energyWh, 'doubleValue') || 0;
      const elapsed = ext(data.elapsedSeconds, 'integerValue') || 0;
      const stopReason = ext(data.stopReason, 'stringValue') || 'user_stop';
      const soc = ext(data.soc, 'doubleValue') || 0;
      
      const carbonSavedGrams = energyWh * 0.8;
      
      additionalData = {
        energyWh,
        elapsedSeconds: elapsed,
        stopReason,
        soc,
        carbonSavedGrams
      };
    }

    // 3. Terminate tracked session
    if (activeSessionId) {
        const payload: any = { 
          endTime: new Date(), 
          status: 'completed',
        };
        
        if (additionalData.energyWh !== undefined) payload.energyWh = additionalData.energyWh;
        if (additionalData.elapsedSeconds !== undefined) payload.elapsedSeconds = additionalData.elapsedSeconds;
        if (additionalData.stopReason !== undefined) payload.stopReason = additionalData.stopReason;
        if (additionalData.soc !== undefined) payload.soc = additionalData.soc;
        if (additionalData.carbonSavedGrams !== undefined) payload.carbonSavedGrams = additionalData.carbonSavedGrams;

        await setDoc(
          doc(collection(this.db, 'charging_sessions'), activeSessionId),
          payload,
          { merge: true }
        );
        activeSessionId = null;
    } else {
      // 4. Recovery: Check if there's a stale in_progress session
      const q = query(collection(this.db, 'charging_sessions'), where('status', '==', 'in_progress'), orderBy('startTime', 'desc'), limit(1));
      const staleSnap = await getDocs(q);
      if (!staleSnap.empty) {
         const staleDocRef = staleSnap.docs[0].ref;
         
         const payload: any = {
           endTime: new Date(),
           status: 'completed',
         };
         if (additionalData.energyWh !== undefined) payload.energyWh = additionalData.energyWh;
         if (additionalData.elapsedSeconds !== undefined) payload.elapsedSeconds = additionalData.elapsedSeconds;
         if (additionalData.stopReason !== undefined) payload.stopReason = additionalData.stopReason;
         if (additionalData.soc !== undefined) payload.soc = additionalData.soc;
         if (additionalData.carbonSavedGrams !== undefined) payload.carbonSavedGrams = additionalData.carbonSavedGrams;

         await setDoc(staleDocRef, payload, { merge: true });
      }
    }
  }
}
