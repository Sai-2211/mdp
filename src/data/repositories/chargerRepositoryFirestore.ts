import { getFirestore, collection, doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';

import type { ChargerRepository, StartChargingResult } from '../../domain/repositories/chargerRepository';
import type { ChargerState, ChargerStatus } from '../../domain/entities/charger';

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
    if (!snap.exists) {
      return { online: false, state: 'unavailable', lastUpdated: new Date() };
    }
    const data = snap.data() as Record<string, unknown>;
    console.log('[DEBUG] Firestore device/status raw data:', JSON.stringify(data));
    const relay = data?.relay;
    const ts = data?.timestamp;
    const lastUpdated = ts && typeof (ts as any).toDate === 'function'
      ? (ts as any).toDate()
      : new Date();
    const online = relay !== undefined;
    const state = parseState(relay);
    return { online, state, lastUpdated };
  }

  async startCharging(): Promise<StartChargingResult> {
    await setDoc(
      doc(collection(this.db, 'device'), 'command'),
      { relay: true },
      { merge: true },
    );
    return {};
  }

  async stopCharging(): Promise<void> {
    await setDoc(
      doc(collection(this.db, 'device'), 'command'),
      { relay: false },
      { merge: true },
    );
  }
}
