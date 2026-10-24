import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useCompany } from './CompanyContext';
import type { UserWithoutPassword } from '@car-stock/shared/types';

const TOKEN_REFRESH_INTERVAL = 20 * 60 * 60 * 1000; // 20 hours (token expires in 24h)

interface AuthContextType {
  user: UserWithoutPassword | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserWithoutPassword | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { refreshSettings } = useCompany();

  const refreshToken = useCallback(async () => {
    try {
      const response = await api.post<{ success: boolean; data?: { token: string } }>('/api/auth/refresh');
      if (response.success && response.data?.token) {
        api.setToken(response.data.token);
      }
    } catch {
      // Token expired or invalid — force logout
      api.setToken(null);
      setUser(null);
    }
  }, []);

  const startRefreshTimer = useCallback(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(refreshToken, TOKEN_REFRESH_INTERVAL);
  }, [refreshToken]);

  const stopRefreshTimer = useCallback(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const token = api.getToken();
      if (token) {
        const response = await api.getProfile();
        if (response.success && response.data) {
          setUser(response.data);
          startRefreshTimer();
        } else {
          setUser(null);
          stopRefreshTimer();
        }
      } else {
        setUser(null);
        stopRefreshTimer();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      stopRefreshTimer();
    } finally {
      setLoading(false);
    }
  }, [startRefreshTimer, stopRefreshTimer]);

  useEffect(() => {
    checkAuth();
    return () => stopRefreshTimer();
  }, [checkAuth, stopRefreshTimer]);

  const login = async (username: string, password: string) => {
    try {
      const response = await api.login(username, password);
      if (response.success && response.data) {
        setUser(response.data.user);
        startRefreshTimer();
        // Settings need a token; reload them now (demo-sale policy, company name).
        void refreshSettings();
      } else {
        throw new Error(response.message || 'Login failed');
      }
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    stopRefreshTimer();
    await api.logout();
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
