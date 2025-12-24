// src/api/public-profile-api.tsx - FIXED SNAKE_CASE VERSION
import { supabase } from '@/lib/supabase';
import {
  Profile,
  ProfileWithAgents
} from '@/types/profile';

class PublicProfileAPI {
  /**
   * Get a public profile by username with all related data
   * This method does not require authentication
   * V6.0: Fetch widgets and agents directly from tables using user_id
   */
  async getPublicProfile(username: string): Promise<ProfileWithAgents | null> {
    if (!username) return null;

    // Get base profile by username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching public profile:', profileError);
      return null;
    }

    const userId = profile.id;

    // Get agents directly from agents table
    const { data: agentDetails, error: agentsError } = await supabase
      .from('agents_with_prompt')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_public', true);

    if (agentsError) {
      console.error('Error fetching public agents:', agentsError);
    }

    // Fetch all active widgets using the V6 RPC function
    const { data: allWidgets, error: widgetsError } = await supabase
      .rpc('get_user_widgets_ordered', {
        p_user_id: userId,
        p_active_only: true
      });

    if (widgetsError) {
      console.error('Error fetching public widgets via RPC:', widgetsError);
    }

    const widgets = allWidgets || [];

    // Map into specific arrays for the frontend
    const linkWidgets = widgets.filter((w: any) => w.widget_type === 'link').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const agentWidgets = widgets.filter((w: any) => w.widget_type === 'agents').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const galleryWidgets = widgets.filter((w: any) => w.widget_type === 'gallery').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const youtubeWidgets = widgets.filter((w: any) => w.widget_type === 'youtube').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const mapsWidgets = widgets.filter((w: any) => w.widget_type === 'maps').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const spotifyWidgets = widgets.filter((w: any) => w.widget_type === 'spotify').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const calendarWidgets = widgets.filter((w: any) => w.widget_type === 'calendar').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const separatorWidgets = widgets.filter((w: any) => w.widget_type === 'separator').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const titleWidgets = widgets.filter((w: any) => w.widget_type === 'title').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));

    const profileWithAgents: ProfileWithAgents = {
      ...profile,
      agentDetails: agentDetails || [],
      linkWidgets,
      agentWidgets,
      galleryWidgets,
      youtubeWidgets,
      mapsWidgets,
      spotifyWidgets,
      calendarWidgets,
      separatorWidgets,
      titleWidgets
    };

    return profileWithAgents;
  }

  /**
   * Get only the basic profile information by username
   * This method does not require authentication
   */
  async getPublicProfileBasic(username: string): Promise<Profile | null> {
    if (!username) return null;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, description, avatar, social_links')
      .eq('username', username)
      .single();

    if (error || !profile) {
      console.error('Error fetching basic public profile:', error);
      return null;
    }

    return profile;
  }
}

export const publicProfileApi = new PublicProfileAPI();