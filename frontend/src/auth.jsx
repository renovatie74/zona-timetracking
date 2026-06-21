/**
 * AuthContext: holds the authenticated user's id, role, and name.
 * The JWT lives in an httpOnly cookie (invisible to JS) — we track login state
 * by calling GET /api/auth/me on mount and after login/logout.
 *
 * Sprint 1 adds GET /api/auth/me and wires up the full login/logout flow.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { id, role, name } | null
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sprint 1: replace stub with real GET /api/auth/me
    setLoading(false);
  }, []);

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    setUser(data);
    return data;
  }

  async function logout() {
    await api.post('/api/auth/logout', {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function isEmployee(user)      { return user?.role === 'employee'; }
export function isManager(user)       { return user?.role === 'manager' || user?.role === 'administrator'; }
export function isAdministrator(user) { return user?.role === 'administrator'; }
