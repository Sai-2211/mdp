import type { SessionsRepository } from '../repositories/sessionsRepository';

export async function listSessions(repo: SessionsRepository) {
  return repo.listSessions();
}

export async function getSessionDetails(repo: SessionsRepository, sessionId: string) {
  return repo.getSession(sessionId);
}

