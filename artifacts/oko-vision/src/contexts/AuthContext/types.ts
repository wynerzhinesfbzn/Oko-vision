export type AuthMethod = 'password' | 'biometrics' | 'mnemonic' | 'crypto' | 'none';

export interface AuthState {
  isAuthenticated: boolean;
  method: AuthMethod | null;
  user: { name?: string; email?: string } | null;
}
