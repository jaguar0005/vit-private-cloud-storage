import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  quotaBytes: number;
  usedBytes: number;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requestOtp: (email: string) => Promise<{ success: boolean; message: string; devOtp?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ success: boolean; user: User }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Set axios default configuration to include cookies in all requests
axios.defaults.withCredentials = true;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = async () => {
    try {
      const response = await axios.get('/api/v1/auth/me');
      if (response.data?.success && response.data?.data?.user) {
        setUser(response.data.data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const requestOtp = async (email: string) => {
    try {
      const response = await axios.post('/api/v1/auth/request-otp', { email });
      return { success: true, message: response.data.message, devOtp: response.data.devOtp };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        throw new Error(err.response.data.error.message);
      }
      throw new Error('Failed to request verification code. Please try again.');
    }
  };

  const verifyOtp = async (email: string, otp: string) => {
    try {
      const response = await axios.post('/api/v1/auth/verify-otp', { email, otp });
      const userData = response.data.data.user;
      setUser(userData);
      return { success: true, user: userData };
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        throw new Error(err.response.data.error.message);
      }
      throw new Error('Verification failed. Please check your code.');
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/v1/auth/logout');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        requestOtp,
        verifyOtp,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
