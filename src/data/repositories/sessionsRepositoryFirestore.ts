import { getFirestore, collection, doc, getDoc, getDocs, query, orderBy, limit } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';

import type { SessionsRepository } from '../../domain/repositories/sessionsRepository';
import type { ChargingSession } from '../../domain/entities/session';

export class SessionsRepositoryFirestore implements SessionsRepository {
  private readonly db = getFirestore(getApp());

  async listSessions(): Promise<ChargingSession[]> {
    const q = query(
      collection(this.db, 'charging_sessions'),
      orderBy('startTime', 'desc'),
      limit(10)
    );
    
    const snap = await getDocs(q);
    return snap.docs.map((d: any) => {
      const data = d.data() as any;
      return {
        sessionId: d.id,
        startTime: data.startTime ? data.startTime.toDate() : new Date(),
        endTime: data.endTime ? data.endTime.toDate() : undefined,
        energyWh: data.energyWh ?? 0,
        elapsedSeconds: data.elapsedSeconds,
        stopReason: data.stopReason,
        soc: data.soc,
        profile: data.profile,
      };
    });
  }

  async getSession(sessionId: string): Promise<ChargingSession> {
    const snap = await getDoc(doc(collection(this.db, 'charging_sessions'), sessionId));
    if (!snap.exists()) throw new Error('Session not found');
    const data = snap.data() as any;
    return {
      sessionId: snap.id,
      startTime: data.startTime ? data.startTime.toDate() : new Date(),
      endTime: data.endTime ? data.endTime.toDate() : undefined,
      energyWh: data.energyWh ?? 0,
      elapsedSeconds: data.elapsedSeconds,
      stopReason: data.stopReason,
      soc: data.soc,
      profile: data.profile,
    };
  }
}
