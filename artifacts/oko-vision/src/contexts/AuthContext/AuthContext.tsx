import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthState, AuthMethod } from './types';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';

interface AuthContextType extends AuthState {
  login: (method: AuthMethod, credentials: Record<string, string>) => Promise<boolean>;
  logout: () => void;
  biometricsSupported: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'oko-auth-state';

function loadPersistedAuth(): AuthState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AuthState;
  } catch { /* ignore */ }
  return { isAuthenticated: false, method: null, user: null };
}

function persistAuth(state: AuthState) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    // Minimal challenge — in production this must come from the server
    const challenge = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const result = await startAuthentication({
      optionsJSON: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
        allowCredentials: [],
      },
    });
    // Signature returned — consider verified (server check happens in production)
    return !!result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // NotAllowedError = user dismissed, NotSupportedError = no authenticator
    console.warn('[WebAuthn]', msg);
    return false;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(loadPersistedAuth);
  const [biometricsSupported, setBiometricsSupported] = useState(false);

  useEffect(() => {
    (async () => {
      if (window.PublicKeyCredential) {
        try {
          const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setBiometricsSupported(ok);
        } catch { setBiometricsSupported(false); }
      }
    })();
  }, []);

  const login = async (method: AuthMethod, credentials: Record<string, string>): Promise<boolean> => {
    let success = false;

    if (method === 'password') {
      const stored = localStorage.getItem('oko-app-password');
      // First-time: any non-empty password is accepted and stored
      if (!stored) {
        if (credentials.password && credentials.password.length >= 6) {
          localStorage.setItem('oko-app-password', btoa(credentials.password));
          success = true;
        }
      } else {
        success = stored === btoa(credentials.password ?? '');
      }
    }

    if (method === 'biometrics') {
      success = await authenticateWithBiometrics();
    }

    if (method === 'mnemonic') {
      const phrase = (credentials.mnemonic ?? '').trim().split(/\s+/);
      // Accept any 12-word mnemonic (bip39) — real validation happens in WalletContext
      success = phrase.length >= 12 || phrase.length === 6;
    }

    if (method === 'crypto') {
      // Placeholder: hardware key flow — auto-succeed for now
      success = true;
    }

    if (success) {
      const next: AuthState = { isAuthenticated: true, method, user: { name: 'Trader' } };
      setState(next);
      persistAuth(next);
    }

    return success;
  };

  const logout = () => {
    const next: AuthState = { isAuthenticated: false, method: null, user: null };
    setState(next);
    persistAuth(next);
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, biometricsSupported }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
