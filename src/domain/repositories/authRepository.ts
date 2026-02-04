export type AuthResult = {
  accessToken: string;
};

export type AuthRepository = {
  register(email: string, password: string): Promise<AuthResult>;
  login(email: string, password: string): Promise<AuthResult>;
};

