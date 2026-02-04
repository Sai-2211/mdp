import type { ApiClient } from './apiClient';

/**
 * Auth API (backend).
 *
 * Network/Security notes:
 * - These endpoints do not require an Authorization header.
 * - The returned access token is stored securely and then used for protected calls.
 */
type AuthResponseDto = {
  accessToken?: string;
  token?: string;
  jwt?: string;
};

function pickToken(dto: AuthResponseDto): string | null {
  return dto.accessToken ?? dto.token ?? dto.jwt ?? null;
}

export async function register(api: ApiClient, email: string, password: string): Promise<{ accessToken: string }> {
  const dto = await api.requestJson<AuthResponseDto>({
    path: '/auth/register',
    method: 'POST',
    auth: false,
    body: { email, password },
  });

  const accessToken = pickToken(dto);
  if (!accessToken) throw new Error('Missing access token in /auth/register response');
  return { accessToken };
}

export async function login(api: ApiClient, email: string, password: string): Promise<{ accessToken: string }> {
  const dto = await api.requestJson<AuthResponseDto>({
    path: '/auth/login',
    method: 'POST',
    auth: false,
    body: { email, password },
  });

  const accessToken = pickToken(dto);
  if (!accessToken) throw new Error('Missing access token in /auth/login response');
  return { accessToken };
}
