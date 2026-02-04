import type { ApiClient } from './apiClient';
import type { ChargerState, ChargerStatus } from '../../domain/entities/charger';

/**
 * Charger status API (backend).
 *
 * The app only reads status from the backend server; it never queries the ESP32 directly.
 */
type ChargerStatusDto = {
  online?: boolean;
  isOnline?: boolean;
  chargerOnline?: boolean;
  chargerState?: string;
  state?: string;
  updatedAt?: string;
  lastUpdated?: string;
};

function parseChargerState(value: unknown): ChargerState {
  if (typeof value !== 'string') return 'unavailable';
  const v = value.toLowerCase();
  if (v === 'idle' || v === 'charging' || v === 'unavailable') return v;
  return 'unavailable';
}

function parseOnline(dto: ChargerStatusDto): boolean {
  if (typeof dto.online === 'boolean') return dto.online;
  if (typeof dto.isOnline === 'boolean') return dto.isOnline;
  if (typeof dto.chargerOnline === 'boolean') return dto.chargerOnline;
  return false;
}

function parseLastUpdated(dto: ChargerStatusDto): Date {
  const raw = dto.updatedAt ?? dto.lastUpdated;
  const d = raw ? new Date(raw) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function getStatus(api: ApiClient): Promise<ChargerStatus> {
  const dto = await api.requestJson<ChargerStatusDto>({ path: '/charger/status', method: 'GET' });
  const online = parseOnline(dto);
  const state = parseChargerState(dto.chargerState ?? dto.state ?? (online ? 'idle' : 'unavailable'));
  return { online, state, lastUpdated: parseLastUpdated(dto) };
}
