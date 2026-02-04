import { ApiError, AuthRequiredError, NetworkError } from '../../core/errors';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
  defaultTimeoutMs?: number;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  auth?: boolean;
  headers?: Record<string, string>;
  body?: JsonValue;
  timeoutMs?: number;
};

/**
 * Thin REST client wrapper around `fetch`.
 *
 * Network/Security notes:
 * - Protected calls automatically include `Authorization: Bearer <token>`.
 * - A `401 Unauthorized` response triggers `onUnauthorized()` so the app can force re-login.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null;
  private readonly onUnauthorized?: () => void;
  private readonly defaultTimeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = options.getAccessToken;
    this.onUnauthorized = options.onUnauthorized;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
  }

  async requestJson<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path.startsWith('/') ? '' : '/'}${options.path}`;
    const auth = options.auth ?? true;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    };

    if (auth) {
      const token = this.getAccessToken?.() ?? null;
      if (!token) {
        throw new AuthRequiredError('Missing access token');
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.defaultTimeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await response.json().catch(() => null) : await response.text().catch(() => null);

      if (response.ok) {
        return payload as T;
      }

      const message =
        (payload && typeof payload === 'object' && 'message' in payload && typeof (payload as any).message === 'string'
          ? (payload as any).message
          : typeof payload === 'string' && payload.trim().length > 0
            ? payload
            : `Request failed (${response.status})`) as string;

      if (response.status === 401) {
        this.onUnauthorized?.();
      }

      throw new ApiError({ status: response.status, message });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new NetworkError('Request timed out');
      }
      if (err instanceof ApiError || err instanceof AuthRequiredError) {
        throw err;
      }
      throw new NetworkError(err?.message ?? 'Network error');
    } finally {
      clearTimeout(timeout);
    }
  }
}

