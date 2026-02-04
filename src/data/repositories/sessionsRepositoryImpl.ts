import type { SessionsRepository } from '../../domain/repositories/sessionsRepository';
import type { ApiClient } from '../api/apiClient';
import { getSession, listSessions } from '../api/sessionsApi';

export class SessionsRepositoryImpl implements SessionsRepository {
  constructor(private readonly api: ApiClient) {}

  listSessions() {
    return listSessions(this.api);
  }

  getSession(sessionId: string) {
    return getSession(this.api, sessionId);
  }
}

