import { useContext } from 'react';
import { ProfileContext } from '@/context/profile-context';
import type { ProfileContextType } from '@/types/profile';

/**
 * Custom hook to access the profile context.
 * Ensures sthe hook is used within a ProfileProvider.
 */
export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
