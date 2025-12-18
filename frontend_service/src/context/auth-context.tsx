// src/context/auth-context.tsx - Updated with snake_case support
import React, { createContext, useEffect, useState } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUp: (email: string, password: string, options?: {
    data?: {
      username?: string;
      display_name?: string;
      [key: string]: any;
    }
  }) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  verifyOtp: (email: string, token: string, type: 'signup' | 'recovery') => Promise<{ error: AuthError | null }>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (
    email: string, 
    password: string, 
    options?: {
      data?: {
        username?: string;
        display_name?: string;
        [key: string]: any;
      }
    }
  ) => {
    // Validate username format if provided
    if (options?.data?.username) {
      const username = options.data.username.toLowerCase().trim();
      const usernameRegex = /^[a-zA-Z0-9_-]+$/;
      
      if (username.length < 3 || username.length > 30) {
        return { 
          error: { 
            message: 'Username must be between 3 and 30 characters',
            name: 'ValidationError'
          } as AuthError 
        };
      }
      
      if (!usernameRegex.test(username)) {
        return { 
          error: { 
            message: 'Username can only contain letters, numbers, underscores, and hyphens',
            name: 'ValidationError'
          } as AuthError 
        };
      }

      // Check username availability before signup
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', username)
        .maybeSingle();

      if (existingUser) {
        return { 
          error: { 
            message: 'Username is already taken',
            name: 'ValidationError'
          } as AuthError 
        };
      }

      // Ensure username is properly formatted in metadata
      options.data.username = username;
      if (!options.data.display_name) {
        options.data.display_name = username; // Use username as default display name
      }
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options
    })

    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  const verifyOtp = async (email: string, token: string, type: 'signup' | 'recovery') => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type,
    })
    return { error }
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    verifyOtp,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}