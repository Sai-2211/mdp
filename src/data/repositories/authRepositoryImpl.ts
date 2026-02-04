import type { AuthRepository } from '../../domain/repositories/authRepository';
import type { ApiClient } from '../api/apiClient';
import { login, register } from '../api/authApi';

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly api: ApiClient) {}

  register(email: string, password: string) {
    return register(this.api, email, password);
  }

  login(email: string, password: string) {
    return login(this.api, email, password);
  }
}

