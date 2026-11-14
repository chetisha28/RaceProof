import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('raceproof_token'));
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    const storedToken = localStorage.getItem('raceproof_token');
    if (!storedToken) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await authAPI.me();
      if (res.data.success) {
        setUser(res.data.data);
      } else {
        setUser(null);
      }
    } catch (err) {
      localStorage.removeItem('raceproof_token');
      localStorage.removeItem('raceproof_user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    if (res.data.success) {
      const { user: userData, token: authToken } = res.data.data;
      localStorage.setItem('raceproof_token', authToken);
      localStorage.setItem('raceproof_user', JSON.stringify(userData));
      setToken(authToken);
      setUser(userData);
      await fetchCurrentUser(); // get full profile with memberships
      return userData;
    }
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    if (res.data.success) {
      const { user: userData, token: authToken } = res.data.data;
      localStorage.setItem('raceproof_token', authToken);
      localStorage.setItem('raceproof_user', JSON.stringify(userData));
      setToken(authToken);
      setUser(userData);
      await fetchCurrentUser();
      return userData;
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (e) {
      // Ignore network failure on logout
    } finally {
      localStorage.removeItem('raceproof_token');
      localStorage.removeItem('raceproof_user');
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser: fetchCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

