// src/api/public-profile-api.tsx - FIXED SNAKE_CASE VERSION
import { supabase } from '@/lib/supabase';
import { 
  Profile, 
  ProfileWithAgents, 
  ProfileLink,
  Agent,
  Widget,
  WidgetAgents,
  WidgetGallery
} from '@/types/profile';

class PublicProfileAPI {
  /**
   * Get a public profile by username with all related data
   * This method does not require authentication
   */
  async getPublicProfile(username: string): Promise<ProfileWithAgents | null> {
    if (!username) return null;

    // console.log('🔍 Getting public profile for username:', username);

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

    // Ensure widgets are sorted by position - using slice() to avoid mutation
    const widgets = (profile.widgets || []) as Widget[];
    const sortedWidgets = widgets.length > 0 
      ? widgets.slice().sort((a, b) => a.position - b.position) 
      : [];
    
    // console.log('🎯 All widgets from profile:', widgets);
    // console.log('🎯 Active widgets:', widgets.filter(w => w.is_active));
    // console.log('🎯 Widget types:', widgets.map(w => ({ id: w.id, type: w.type, is_active: w.is_active })));

    // Get agents details
    const agentIds = (profile.agents || []) as string[];
    let agentDetails: Agent[] = [];
    
    if (agentIds.length > 0) {
      const { data: agents, error: agentsError } = await supabase
        .from('agents_with_prompt') // Using the view to get system_prompt
        .select('*')
        .in('id', agentIds);

      if (!agentsError && agents) {
        agentDetails = agents;
      }
    }

    // Get link widgets
    const linkWidgetIds = sortedWidgets
      .filter(w => w.type === 'link' && w.is_active)
      .map(w => w.id);
    
    console.log('Link widget IDs:', linkWidgetIds);
    
    let linkWidgets: ProfileLink[] = [];
    if (linkWidgetIds.length > 0) {
      const { data: links, error: linksError } = await supabase
        .from('widget_links')
        .select('*')
        .in('id', linkWidgetIds);
      
      if (linksError) {
        console.error('Error fetching link widgets:', linksError);
      }
      
      if (!linksError && links) {
        linkWidgets = links;
        console.log('Link widgets fetched:', links);
      }
    }

    // Get agent widgets
    const agentWidgetIds = sortedWidgets
      .filter(w => w.type === 'agents' && w.is_active)
      .map(w => w.id);
    
    console.log('Agent widget IDs:', agentWidgetIds);
    
    let agentWidgets: WidgetAgents[] = [];
    if (agentWidgetIds.length > 0) {
      const { data: agentWidgetsData, error: agentWidgetsError } = await supabase
        .from('widget_agents')
        .select('*')
        .in('id', agentWidgetIds);
      
      if (agentWidgetsError) {
        console.error('Error fetching agent widgets:', agentWidgetsError);
      }
      
      if (!agentWidgetsError && agentWidgetsData) {
        agentWidgets = agentWidgetsData;
        console.log('Agent widgets fetched:', agentWidgetsData);
      }
    }

    // Get separator widgets
    const separatorWidgetIds = sortedWidgets
      .filter(w => w.type === 'separator' && w.is_active)
      .map(w => w.id);
    
    console.log('Separator widget IDs:', separatorWidgetIds);
    
    let separatorWidgets: any[] = [];
    if (separatorWidgetIds.length > 0) {
      const { data: separatorWidgetsData, error: separatorWidgetsError } = await supabase
        .from('widget_separator')
        .select('*')
        .in('id', separatorWidgetIds);
      
      if (separatorWidgetsError) {
        console.error('Error fetching separator widgets:', separatorWidgetsError);
      }
      
      if (!separatorWidgetsError && separatorWidgetsData) {
        separatorWidgets = separatorWidgetsData;
        console.log('Separator widgets fetched:', separatorWidgetsData);
      }
    }

    // Get title widgets
    const titleWidgetIds = sortedWidgets
      .filter(w => w.type === 'title' && w.is_active)
      .map(w => w.id);
    
    console.log('Title widget IDs:', titleWidgetIds);
    
    let titleWidgets: any[] = [];
    if (titleWidgetIds.length > 0) {
      const { data: titleWidgetsData, error: titleWidgetsError } = await supabase
        .from('widget_title')
        .select('*')
        .in('id', titleWidgetIds);
      
      if (titleWidgetsError) {
        console.error('Error fetching title widgets:', titleWidgetsError);
      }
      
      if (!titleWidgetsError && titleWidgetsData) {
        titleWidgets = titleWidgetsData;
        console.log('Title widgets fetched:', titleWidgetsData);
      }
    }

    // Get gallery widgets
    const galleryWidgetIds = sortedWidgets
      .filter(w => w.type === 'gallery' && w.is_active)
      .map(w => w.id);
    
    console.log('Gallery widget IDs:', galleryWidgetIds);
    
    let galleryWidgets: WidgetGallery[] = [];
    if (galleryWidgetIds.length > 0) {
      const { data: galleryWidgetsData, error: galleryWidgetsError } = await supabase
        .from('widget_gallery')
        .select('*')
        .in('id', galleryWidgetIds);
      
      if (galleryWidgetsError) {
        console.error('Error fetching gallery widgets:', galleryWidgetsError);
      }
      
      if (!galleryWidgetsError && galleryWidgetsData) {
        galleryWidgets = galleryWidgetsData;
        console.log('Gallery widgets fetched:', galleryWidgetsData);
      }
    }

    // Get YouTube widgets
    const youtubeWidgetIds = sortedWidgets
      .filter(w => w.type === 'youtube' && w.is_active)
      .map(w => w.id);
    
    console.log('YouTube widget IDs:', youtubeWidgetIds);
    
    let youtubeWidgets: any[] = [];
    if (youtubeWidgetIds.length > 0) {
      const { data: youtubeWidgetsData, error: youtubeWidgetsError } = await supabase
        .from('widget_youtube')
        .select('*')
        .in('id', youtubeWidgetIds);
      
      if (youtubeWidgetsError) {
        console.error('Error fetching YouTube widgets:', youtubeWidgetsError);
      }
      
      if (!youtubeWidgetsError && youtubeWidgetsData) {
        youtubeWidgets = youtubeWidgetsData;
        console.log('YouTube widgets fetched:', youtubeWidgetsData);
      }
    }

    // Get Maps widgets
    const mapsWidgetIds = sortedWidgets
      .filter(w => w.type === 'maps' && w.is_active)
      .map(w => w.id);
    
    console.log('Maps widget IDs:', mapsWidgetIds);
    
    let mapsWidgets: any[] = [];
    if (mapsWidgetIds.length > 0) {
      const { data: mapsWidgetsData, error: mapsWidgetsError } = await supabase
        .from('widget_maps')
        .select('*')
        .in('id', mapsWidgetIds);
      
      if (mapsWidgetsError) {
        console.error('Error fetching Maps widgets:', mapsWidgetsError);
      }
      
      if (!mapsWidgetsError && mapsWidgetsData) {
        mapsWidgets = mapsWidgetsData;
        console.log('Maps widgets fetched:', mapsWidgetsData);
      }
    }

    // Get Spotify widgets
    const spotifyWidgetIds = sortedWidgets
      .filter(w => w.type === 'spotify' && w.is_active)
      .map(w => w.id);
    
    console.log('Spotify widget IDs:', spotifyWidgetIds);
    
    let spotifyWidgets: any[] = [];
    if (spotifyWidgetIds.length > 0) {
      const { data: spotifyWidgetsData, error: spotifyWidgetsError } = await supabase
        .from('widget_spotify')
        .select('*')
        .in('id', spotifyWidgetIds);
      
      if (spotifyWidgetsError) {
        console.error('Error fetching Spotify widgets:', spotifyWidgetsError);
      }
      
      if (!spotifyWidgetsError && spotifyWidgetsData) {
        spotifyWidgets = spotifyWidgetsData;
        console.log('Spotify widgets fetched:', spotifyWidgetsData);
      }
    }

    // Get Calendar widgets
    const calendarWidgetIds = sortedWidgets
      .filter(w => w.type === 'calendar' && w.is_active)
      .map(w => w.id);
    
    console.log('Calendar widget IDs:', calendarWidgetIds);
    
    let calendarWidgets: any[] = [];
    if (calendarWidgetIds.length > 0) {
      const { data: calendarWidgetsData, error: calendarWidgetsError } = await supabase
        .from('widget_calendar')
        .select('*')
        .in('id', calendarWidgetIds);
      
      if (calendarWidgetsError) {
        console.error('Error fetching Calendar widgets:', calendarWidgetsError);
      }
      
      if (!calendarWidgetsError && calendarWidgetsData) {
        calendarWidgets = calendarWidgetsData;
        console.log('Calendar widgets fetched:', calendarWidgetsData);
      }
    }

    // Construct the complete profile object
    // console.log('📊 Widget data summary:');
    // console.log('- linkWidgets:', linkWidgets?.length || 0);
    // console.log('- separatorWidgets:', separatorWidgets?.length || 0);
    // console.log('- titleWidgets:', titleWidgets?.length || 0);
    // console.log('- youtubeWidgets:', youtubeWidgets?.length || 0);
    // console.log('- galleryWidgets:', galleryWidgets?.length || 0);
    // console.log('- mapsWidgets:', mapsWidgets?.length || 0);
    // console.log('- spotifyWidgets:', spotifyWidgets?.length || 0);
    // console.log('- calendarWidgets:', calendarWidgets?.length || 0);
    
    const profileWithAgents: ProfileWithAgents = {
      ...profile,
      widgets: sortedWidgets,
      agentDetails,
      linkWidgets,
      agentWidgets,
      separatorWidgets,
      titleWidgets,
      galleryWidgets,
      youtubeWidgets,
      mapsWidgets,
      spotifyWidgets,
      calendarWidgets
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