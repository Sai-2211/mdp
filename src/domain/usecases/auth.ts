import type { AuthRepository } from '../repositories/authRepository';

export async function registerUser(repo: AuthRepository, email: string, password: string) {
  return repo.register(email, password);
}

export async function loginUser(repo: AuthRepository, email: string, password: string) {
  return repo.login(email, password);
}

