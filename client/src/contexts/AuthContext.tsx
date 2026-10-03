import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/axios';
import { resetLibraryStore } from '@/library/library-store';

interface User {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: { username: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Wipe the shared library store whenever the authenticated identity actually changes
  // (bootstrap swap, login, register, logout, or A->B switch) so the next user never sees
  // the previous user's favorite/reading visuals before their own data hydrates.
  const prevIdentityRef = React.useRef<string | null>(null);
  useEffect(() => {
    const nextId = user?.id ?? null;
    if (prevIdentityRef.current !== nextId) {
      resetLibraryStore();
      prevIdentityRef.current = nextId;
    }
  }, [user?.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    // Bootstrap: prove the stored token is still valid.
    api
      .get('/auth/me')
      .then((res) => setUser(res.data))
      .catch((err: unknown) => {
        // Stale/expired token -> 401: clear it silently. No toast, no raw status.
        // ProtectedLayout then routes to /login because user is null.
        if ((err as { response?: { status?: number } })?.response?.status === 401) {
          localStorage.removeItem('token');
        }
        // Transient network failures leave the token in place; loading ends and the
        // user lands on /login so they can retry without us nuking a valid session.
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (data: { username: string; email: string; password: string; displayName?: string }) => {
    const res = await api.post('/auth/register', data);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}