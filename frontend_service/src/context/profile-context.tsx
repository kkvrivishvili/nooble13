// src/context/profile-context.tsx
import { createContext, useContext, ReactNode, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '@/api/profile-api';
import { 
  ProfileWithAgents, 
  ProfileUpdatePayload, 
  ProfileLink, 
  SocialLink, 
  ProfileContextType, 
  SyncStatus,
  Widget,
  Agent
} from '@/types/profile';
import { supabase } from '@/lib/supabase';

// 1. Context Definition
const ProfileContext = createContext<ProfileContextType | null>(null);

// 2. Provider Component
interface ProfileProviderProps {
  children: ReactNode;
}

export const ProfileProvider = ({ children }: ProfileProviderProps) => {
  const queryClient = useQueryClient();

  // Listen for auth changes and clear profile cache when user signs out
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const { data: profile, isLoading, error, refetch: refreshProfile } = useQuery<ProfileWithAgents | null>({
    queryKey: ['myProfile'],
    queryFn: async () => {
      const profile = await profileApi.getMyProfile();
      
      // TEMPORARY FIX: Auto-sync widgets if needed
      if (profile) {
        const hasWidgetData = (profile.linkWidgets && profile.linkWidgets.length > 0) || 
                             (profile.agentWidgets && profile.agentWidgets.length > 0);
        const hasWidgetEntries = profile.widgets && profile.widgets.length > 0;
        
        if (hasWidgetData && !hasWidgetEntries) {
          console.log('🔄 Auto-syncing widgets for profile:', profile.id);
          try {
            await profileApi.syncProfileWidgets(profile.id);
            // Refetch profile to get updated widgets array
            return await profileApi.getMyProfile();
          } catch (syncError) {
            console.error('❌ Widget sync failed:', syncError);
            // Return original profile even if sync fails
            return profile;
          }
        }
      }
      
      return profile;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: ProfileUpdatePayload) => profileApi.updateProfile(payload),
    onMutate: async (newPayload) => {
      await queryClient.cancelQueries({ queryKey: ['myProfile'] });
      const previousProfile = queryClient.getQueryData<ProfileWithAgents>(['myProfile']);
      
      queryClient.setQueryData<ProfileWithAgents | null>(['myProfile'], (old) => {
        if (!old) return null;
        return { ...old, ...newPayload };
      });
      
      return { previousProfile };
    },
    onError: (_err, _newPayload, context) => {
      queryClient.setQueryData(['myProfile'], context?.previousProfile);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
    },
  });

  // Profile info update
  const updateProfileInfo = (data: { display_name?: string; description?: string; avatar?: string; }) => {
    updateProfileMutation.mutate(data);
  };

  const updateProfile = (data: ProfileUpdatePayload) => {
    updateProfileMutation.mutate(data);
  };

  const isUsernameAvailable = async (username: string): Promise<boolean> => {
    return profileApi.isUsernameAvailable(username);
  };

  // Link widget management
  const addLinkWidget = async (link: Omit<ProfileLink, 'id' | 'created_at' | 'profile_id'>) => {
    if (!profile) return;
    
    await profileApi.createLinkWidget(profile.id, link);
    await refreshProfile();
  };

  const updateLinkWidget = async (id: string, data: Partial<Omit<ProfileLink, 'id'>>) => {
    if (!profile) return;
    
    await profileApi.updateLinkWidget(id, data);
    await refreshProfile();
  };

  const removeLinkWidget = async (id: string) => {
    if (!profile) return;
    
    await profileApi.deleteWidget(profile.id, id, 'link');
    await refreshProfile();
  };

  const reorderWidgets = async (widgets: Widget[]) => {
    if (!profile) return;
    
    const widgetIds = widgets.map(w => w.id);
    await profileApi.reorderWidgets(profile.id, widgetIds);
    await refreshProfile();
  };

  // Social link management (still embedded in profile)
  const addSocialLink = (socialLink: Omit<SocialLink, 'icon'>) => {
    if (!profile) return;
    const updatedSocials = [...(profile.social_links || []), socialLink as SocialLink];
    updateProfileMutation.mutate({ social_links: updatedSocials });
  };

  const updateSocialLink = (platform: string, data: Partial<Omit<SocialLink, 'platform'>>) => {
    if (!profile) return;
    const updatedSocials = profile.social_links.map((sl: SocialLink) => 
      sl.platform === platform ? { ...sl, ...data } : sl
    );
    updateProfileMutation.mutate({ social_links: updatedSocials });
  };

  const removeSocialLink = (platform: string) => {
    if (!profile) return;
    const updatedSocials = profile.social_links.filter((sl: SocialLink) => 
      sl.platform !== platform
    );
    updateProfileMutation.mutate({ social_links: updatedSocials });
  };

  // Agent management
  const createAgent = async (templateId: string, name?: string): Promise<Agent> => {
    const agent = await profileApi.createAgentFromTemplate(templateId, name);
    await refreshProfile();
    return agent;
  };

  const updateAgent = async (agentId: string, data: Partial<Agent>) => {
    await profileApi.updateAgent(agentId, data);
    await refreshProfile();
  };

  const deleteAgent = async (agentId: string) => {
    if (!profile) return;
    await profileApi.deleteAgent(profile.id, agentId);
    await refreshProfile();
  };

  const contextValue: ProfileContextType = {
    profile,
    isLoading,
    isError: !!error,
    updateProfile,
    updateProfileInfo,
    addLinkWidget,
    updateLinkWidget,
    removeLinkWidget,
    reorderWidgets,
    addSocialLink,
    updateSocialLink,
    removeSocialLink,
    createAgent,
    updateAgent,
    deleteAgent,
    refreshProfile,
    isUsernameAvailable,
  };

  return (
    <ProfileContext.Provider value={contextValue}>
      {children}
    </ProfileContext.Provider>
  );
};

// 3. Custom Hook
export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};

// 4. Sync Status Hook (simplified)
export const useSyncStatus = (): SyncStatus => {
  return {
    hasPendingChanges: false,
    pendingChangesCount: 0,
    isOnline: navigator.onLine,
  };
};

// Export context for other uses
export { ProfileContext };