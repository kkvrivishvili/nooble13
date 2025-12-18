import { create } from 'zustand'
import { User, Session } from '@supabase/supabase-js'

interface AuthState {
  auth: {
    user: User | null
    session: Session | null
    loading: boolean
    setUser: (user: User | null) => void
    setSession: (session: Session | null) => void
    setLoading: (loading: boolean) => void
    reset: () => void
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  auth: {
    user: null,
    session: null,
    loading: true,
    setUser: (user) =>
      set((state) => ({ ...state, auth: { ...state.auth, user } })),
    setSession: (session) =>
      set((state) => ({ ...state, auth: { ...state.auth, session } })),
    setLoading: (loading) =>
      set((state) => ({ ...state, auth: { ...state.auth, loading } })),
    reset: () =>
      set((state) => ({
        ...state,
        auth: { ...state.auth, user: null, session: null, loading: false },
      })),
  },
}))

// export const useAuth = () => useAuthStore((state) => state.auth)
