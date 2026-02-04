import type { ApiClient } from './apiClient';

type StartChargingDto = {
  sessionId?: string;
};

/**
 * Charging control is performed via secure backend authorization.
 *
 * Security notes:
 * - The mobile app never generates hardware commands locally.
 * - The mobile app never communicates directly with the ESP32.
 * - Start/stop requests are sent to the backend which authorizes the user and forwards commands securely.
 */
export async function startCharging(api: ApiClient): Promise<{ sessionId?: string }> {
  const dto = await api.requestJson<StartChargingDto>({ path: '/charging/start', method: 'POST' });
  return { sessionId: dto?.sessionId };
}

export async function stopCharging(api: ApiClient): Promise<void> {
  await api.requestJson({ path: '/charging/stop', method: 'POST' });
}

