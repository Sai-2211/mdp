import EventEmitter from 'eventemitter3';

import type { WebSocketAuthMode } from '../../config/appConfig';
import type { LiveConnectionState, LiveChargingTelemetry } from '../../domain/entities/liveCharging';

type StateListener = (state: LiveConnectionState) => void;
type DataListener = (data: LiveChargingTelemetry) => void;

type Options = {
  wsUrl: string;
  authMode: WebSocketAuthMode;
  getAccessToken: () => string | null;
};

/**
 * WebSocket client for live charging telemetry with auto-reconnect.
 *
 * Network/Security notes:
 * - Auth is handled via backend-issued tokens; the app only attaches the access token.
 * - The app never communicates with the ESP32 directly.
 */
export class LiveChargingSocket {
  private readonly wsUrl: string;
  private readonly authMode: WebSocketAuthMode;
  private readonly getAccessToken: () => string | null;
  private ws: WebSocket | null = null;
  private readonly events = new EventEmitter();
  private state: LiveConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private manualClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: Options) {
    this.wsUrl = options.wsUrl;
    this.authMode = options.authMode;
    this.getAccessToken = options.getAccessToken;
  }

  getConnectionState(): LiveConnectionState {
    return this.state;
  }

  onConnectionStateChange(listener: StateListener): () => void {
    this.events.on('state', listener);
    return () => this.events.off('state', listener);
  }

  subscribe(listener: DataListener): () => void {
    this.events.on('data', listener);
    return () => this.events.off('data', listener);
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.manualClose = false;

    const token = this.getAccessToken();
    if (!token) {
      this.setState('error');
      return;
    }

    const wsUrl =
      this.authMode === 'query'
        ? `${this.wsUrl}${this.wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
        : this.wsUrl;

    this.setState('connecting');

    // React Native WebSocket supports headers; browsers generally do not.
    const ws: WebSocket =
      this.authMode === 'header'
        ? new (WebSocket as any)(wsUrl, undefined, { headers: { Authorization: `Bearer ${token}` } })
        : new WebSocket(wsUrl);

    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('connected');
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (!parsed || typeof parsed !== 'object') return;
        // Normalize defensively to avoid UI crashes on unexpected types.
        const data = parsed as any;
        const normalized: LiveChargingTelemetry = {
          voltage: Number(data.voltage) || 0,
          current: Number(data.current) || 0,
          power: Number(data.power) || 0,
          energyWh: Number(data.energyWh) || 0,
          sessionId: typeof data.sessionId === 'string' ? data.sessionId : String(data.sessionId ?? ''),
          elapsedSeconds: Number(data.elapsedSeconds) || 0,
          batteryPercent: Number(data.batteryPercent) || 0,
          chargerState: data.chargerState === 'charging' ? 'charging' : 'idle',
        };
        // App displays values as received from backend telemetry.
        this.events.emit('data', normalized);
      } catch {
        // Ignore non-JSON payloads.
      }
    };

    ws.onerror = () => {
      this.setState('error');
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.manualClose) {
        this.setState('disconnected');
        return;
      }
      this.setState('disconnected');
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setState('disconnected');
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const attempt = Math.min(6, this.reconnectAttempts++);
    const delayMs = Math.min(30_000, 1000 * 2 ** attempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
  }

  private setState(next: LiveConnectionState) {
    if (this.state === next) return;
    this.state = next;
    this.events.emit('state', next);
  }
}
