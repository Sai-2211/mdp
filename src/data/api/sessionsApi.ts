import type { ApiClient } from './apiClient';
import type { ChargingSession } from '../../domain/entities/session';

/**
 * Sessions API (backend).
 *
 * Each charging operation corresponds to a backend-managed session. The app only displays session data.
 */
type SessionDto = {
  sessionId?: string;
  id?: string;
  startTime?: string;
  startAt?: string;
  startedAt?: string;
  endTime?: string;
  endAt?: string;
  endedAt?: string;
  energyWh?: number;
  energy?: number;
  elapsedSeconds?: number;
  durationSeconds?: number;
  stopReason?: string;
  reason?: string;
};

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function mapSession(dto: SessionDto): ChargingSession {
  const sessionId = dto.sessionId ?? dto.id ?? 'unknown';
  const startTime = parseDate(dto.startTime ?? dto.startAt ?? dto.startedAt) ?? new Date();
  const endTime = parseDate(dto.endTime ?? dto.endAt ?? dto.endedAt);
  const energyWh = typeof dto.energyWh === 'number' ? dto.energyWh : typeof dto.energy === 'number' ? dto.energy : 0;
  const elapsedSeconds =
    typeof dto.elapsedSeconds === 'number'
      ? dto.elapsedSeconds
      : typeof dto.durationSeconds === 'number'
        ? dto.durationSeconds
        : undefined;
  const stopReason = dto.stopReason ?? dto.reason;
  return { sessionId, startTime, endTime, energyWh, elapsedSeconds, stopReason };
}

export async function listSessions(api: ApiClient): Promise<ChargingSession[]> {
  const dto = await api.requestJson<SessionDto[]>({ path: '/sessions', method: 'GET' });
  if (!Array.isArray(dto)) return [];
  return dto.map(mapSession).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}

export async function getSession(api: ApiClient, sessionId: string): Promise<ChargingSession> {
  const dto = await api.requestJson<SessionDto>({ path: `/sessions/${encodeURIComponent(sessionId)}`, method: 'GET' });
  return mapSession(dto);
}
