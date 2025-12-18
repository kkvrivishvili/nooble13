// src/api/profile-api.ts - FIXED SNAKE_CASE VERSION
// This version uses correct snake_case table names

import { supabase } from '@/lib/supabase';
import { 
  Profile, 
  ProfileWithAgents, 
  ProfileUpdatePayload, 
  ProfileLink,
  Widget,
  WidgetAgents,
  WidgetGallery
} from '@/types/profile';

class ProfileAPI {
  /**
   * Get the current user's profile with all related data
   * Note: Agent details are fetched but not managed here
   */
  async getMyProfile(): Promise<ProfileWithAgents | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get base profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return null;
    }

    // Ensure widgets are sorted by position - using slice() to avoid mutation
    const widgets = (profile.widgets || []) as Widget[];
    const sortedWidgets = widgets.length > 0 
      ? widgets.slice().sort((a, b) => a.position - b.position) 
      : [];

    // Get agents details (READ-ONLY - use agents-api for modifications)
    const agentIds = (profile.agents || []) as string[];
    let agentDetails = [];
    
    if (agentIds.length > 0) {
      const { data: agents, error: agentsError } = await supabase
        .from('agents_with_prompt') // Using the view to get system_prompt
        .select('*')
        .in('id', agentIds);

      if (!agentsError && agents) {
        agentDetails = agents;
      }
    }

    // Get all widget data based on active widgets
    const activeWidgets = sortedWidgets.filter((w: Widget) => w.is_active);
    
    // Separate widget IDs by type
    const widgetIdsByType = activeWidgets.reduce((acc, widget) => {
      if (!acc[widget.type]) {
        acc[widget.type] = [];
      }
      acc[widget.type].push(widget.id);
      return acc;
    }, {} as Record<string, string[]>);

    // Fetch all widget data in parallel - RLS policies handle access control
    const [
      linkWidgets,
      agentWidgets,
      galleryWidgets,
      youtubeWidgets,
      mapsWidgets,
      spotifyWidgets,
      calendarWidgets,
      separatorWidgets,
      titleWidgets
    ] = await Promise.all([
      // Link widgets
      widgetIdsByType.link?.length > 0
        ? supabase.from('widget_links').select('*').in('id', widgetIdsByType.link)
        : Promise.resolve({ data: [] }),
      
      // Agent widgets
      widgetIdsByType.agents?.length > 0
        ? supabase.from('widget_agents').select('*').in('id', widgetIdsByType.agents)
        : Promise.resolve({ data: [] }),
      
      // Gallery widgets
      widgetIdsByType.gallery?.length > 0
        ? supabase.from('widget_gallery').select('*').in('id', widgetIdsByType.gallery)
        : Promise.resolve({ data: [] }),
      
      // YouTube widgets
      widgetIdsByType.youtube?.length > 0
        ? supabase.from('widget_youtube').select('*').in('id', widgetIdsByType.youtube)
        : Promise.resolve({ data: [] }),
      
      // Maps widgets
      widgetIdsByType.maps?.length > 0
        ? supabase.from('widget_maps').select('*').in('id', widgetIdsByType.maps)
        : Promise.resolve({ data: [] }),
      
      // Spotify widgets
      widgetIdsByType.spotify?.length > 0
        ? supabase.from('widget_spotify').select('*').in('id', widgetIdsByType.spotify)
        : Promise.resolve({ data: [] }),
      
      // Calendar widgets
      widgetIdsByType.calendar?.length > 0
        ? supabase.from('widget_calendar').select('*').in('id', widgetIdsByType.calendar)
        : Promise.resolve({ data: [] }),
      
      // Separator widgets
      widgetIdsByType.separator?.length > 0
        ? supabase.from('widget_separator').select('*').in('id', widgetIdsByType.separator)
        : Promise.resolve({ data: [] }),
      
      // Title widgets
      widgetIdsByType.title?.length > 0
        ? supabase.from('widget_title').select('*').in('id', widgetIdsByType.title)
        : Promise.resolve({ data: [] })
    ]);

    // Sort widget data according to widget order
    const sortWidgetData = <T extends { id: string }>(
      widgetData: T[] | null,
      widgetIds: string[]
    ): T[] => {
      if (!widgetData || !widgetIds) return [];
      const dataMap = new Map(widgetData.map(item => [item.id, item]));
      return widgetIds
        .map(id => dataMap.get(id))
        .filter((item): item is T => item !== undefined);
    };

    // Construct the full profile
    const fullProfile: ProfileWithAgents = {
      ...profile,
      widgets: sortedWidgets,
      agentDetails,
      linkWidgets: sortWidgetData(linkWidgets.data, widgetIdsByType.link || []),
      agentWidgets: sortWidgetData(agentWidgets.data, widgetIdsByType.agents || []),
      galleryWidgets: sortWidgetData(galleryWidgets.data, widgetIdsByType.gallery || []),
      youtubeWidgets: sortWidgetData(youtubeWidgets.data, widgetIdsByType.youtube || []),
      mapsWidgets: sortWidgetData(mapsWidgets.data, widgetIdsByType.maps || []),
      spotifyWidgets: sortWidgetData(spotifyWidgets.data, widgetIdsByType.spotify || []),
      calendarWidgets: sortWidgetData(calendarWidgets.data, widgetIdsByType.calendar || []),
      separatorWidgets: sortWidgetData(separatorWidgets.data, widgetIdsByType.separator || []),
      titleWidgets: sortWidgetData(titleWidgets.data, widgetIdsByType.title || [])
    };

    return fullProfile;
  }

  /**
   * Get a profile by username (public view)
   * Note: This method is kept for backward compatibility, but public-profile-api.ts should be used instead
   * @deprecated Use publicProfileApi.getPublicProfile() instead
   */
  async getProfileByUsername(username: string): Promise<ProfileWithAgents | null> {
    console.warn('⚠️ profileApi.getProfileByUsername() is deprecated. Use publicProfileApi.getPublicProfile() instead.');
    
    // Import and use the dedicated public profile API
    const { publicProfileApi } = await import('./public-profile-api');
    return publicProfileApi.getPublicProfile(username);
  }

  /**
   * Update profile basic info (NO AGENT OPERATIONS)
   */
  async updateProfile(payload: ProfileUpdatePayload): Promise<Profile> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user');

    // Validate payload - ensure no agent operations are attempted here
    if ('agents' in payload) {
      throw new Error('❌ Agent operations not allowed in profile-api. Use agents-api instead.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Check if a username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      // Use the database function for consistency
      const { data, error } = await supabase
        .rpc('check_username_availability', { desired_username: username });

      if (error) {
        console.error('Error checking username availability:', error);
        return false;
      }

      return data;
    } catch (error) {
      console.error('Error in isUsernameAvailable:', error);
      return false;
    }
  }

  // ============================================
  // WIDGET MANAGEMENT METHODS
  // ============================================

  /**
   * Create a new link widget
   */
  async createLinkWidget(profileId: string, link: Omit<ProfileLink, 'id' | 'created_at' | 'profile_id'>): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'link',
        p_widget_data: {
          title: link.title,
          url: link.url,
          description: link.description,
          icon: link.icon
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a link widget
   */
  async updateLinkWidget(widgetId: string, data: Partial<ProfileLink>): Promise<void> {
    const { error } = await supabase
      .from('widget_links')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Delete a widget (removes from profile.widgets and widget table)
   */
  async deleteWidget(profileId: string, widgetId: string, _widgetType: string): Promise<void> {
    // First, remove from profile.widgets array
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('widgets')
      .eq('id', profileId)
      .single();

    if (fetchError) throw fetchError;

    const widgets = (profile.widgets || []) as Widget[];
    const updatedWidgets = widgets.filter((w: Widget) => w.id !== widgetId);
    
    // Recalculate positions to ensure continuous sequence
    const reorderedWidgets = updatedWidgets.map((w, index) => ({
      ...w,
      position: index
    }));

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        widgets: reorderedWidgets,
        updated_at: new Date().toISOString()
      })
      .eq('id', profileId);

    if (updateError) throw updateError;

    // Widget data will be cascade deleted automatically
  }

  /**
   * Reorder widgets
   */
  async reorderWidgets(profileId: string, widgetIds: string[]): Promise<void> {
    const { error } = await supabase
      .rpc('reorder_widgets', {
        p_profile_id: profileId,
        p_widget_ids: widgetIds
      });

    if (error) throw error;
  }

  // ============================================
  // REMOVED AGENT METHODS - USE agents-api.ts INSTEAD
  // ============================================
  
  /**
   * @deprecated Use agentsApi.createAgentFromTemplate() instead
   */
  async createAgentFromTemplate(): Promise<never> {
    throw new Error('❌ createAgentFromTemplate() moved to agents-api. Use agentsApi.createAgentFromTemplate() instead.');
  }

  /**
   * @deprecated Use agentsApi.updateAgent() instead
   */
  async updateAgent(): Promise<never> {
    throw new Error('❌ updateAgent() moved to agents-api. Use agentsApi.updateAgent() instead.');
  }

  /**
   * @deprecated Use agentsApi.deleteAgent() instead
   */
  async deleteAgent(): Promise<never> {
    throw new Error('❌ deleteAgent() moved to agents-api. Use agentsApi.deleteAgent() instead.');
  }

  /**
   * @deprecated Use agentsApi.getAgentTemplates() instead
   */
  async getAgentTemplates(): Promise<never> {
    throw new Error('❌ getAgentTemplates() moved to agents-api. Use agentsApi.getAgentTemplates() instead.');
  }

  // ============================================
  // WIDGET CREATION METHODS (All types)
  // ============================================

  /**
   * Create a new agents widget
   */
  async createAgentsWidget(profileId: string, agentsData: {
    title: string;
    agent_ids: string[];
    display_style: 'card' | 'list' | 'bubble';
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'agents',
        p_widget_data: {
          title: agentsData.title,
          agent_ids: agentsData.agent_ids,
          display_style: agentsData.display_style
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update an agents widget
   */
  async updateAgentsWidget(widgetId: string, data: {
    title?: string;
    agent_ids?: string[];
    display_style?: 'card' | 'list' | 'bubble';
  }): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.agent_ids !== undefined) updateData.agent_ids = data.agent_ids;
    if (data.display_style !== undefined) updateData.display_style = data.display_style;

    const { error } = await supabase
      .from('widget_agents')
      .update(updateData)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new gallery widget
   */
  async createGalleryWidget(profileId: string, gallery: {
    title?: string;
    products: string[];
    show_price?: boolean;
    show_description?: boolean;
    columns?: number;
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'gallery',
        p_widget_data: {
          title: gallery.title || '',
          products: gallery.products || [],
          show_price: gallery.show_price ?? true,
          show_description: gallery.show_description ?? true,
          columns: gallery.columns || 3
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a gallery widget
   */
  async updateGalleryWidget(widgetId: string, data: {
    title?: string;
    products?: string[];
    show_price?: boolean;
    show_description?: boolean;
    columns?: number;
  }): Promise<void> {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.products !== undefined) updateData.products = data.products;
    if (data.show_price !== undefined) updateData.show_price = data.show_price;
    if (data.show_description !== undefined) updateData.show_description = data.show_description;
    if (data.columns !== undefined) updateData.columns = data.columns;

    const { error } = await supabase
      .from('widget_gallery')
      .update(updateData)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new YouTube widget
   */
  async createYouTubeWidget(profileId: string, youtube: {
    video_url: string;
    title?: string;
    autoplay?: boolean;
    show_controls?: boolean;
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'youtube',
        p_widget_data: {
          video_url: youtube.video_url,
          title: youtube.title || '',
          autoplay: youtube.autoplay ?? false,
          show_controls: youtube.show_controls ?? true
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a YouTube widget
   */
  async updateYouTubeWidget(widgetId: string, data: {
    video_url?: string;
    title?: string;
    autoplay?: boolean;
    show_controls?: boolean;
  }): Promise<void> {
    const { error } = await supabase
      .from('widget_youtube')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new Maps widget
   */
  async createMapsWidget(profileId: string, maps: {
    address: string;
    latitude?: number;
    longitude?: number;
    zoom_level?: number;
    map_style?: string;
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'maps',
        p_widget_data: {
          address: maps.address,
          latitude: maps.latitude,
          longitude: maps.longitude,
          zoom_level: maps.zoom_level || 15,
          map_style: maps.map_style || 'roadmap'
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a Maps widget
   */
  async updateMapsWidget(widgetId: string, data: {
    address?: string;
    latitude?: number;
    longitude?: number;
    zoom_level?: number;
    map_style?: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('widget_maps')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new Spotify widget
   */
  async createSpotifyWidget(profileId: string, spotify: {
    spotify_url: string;
    embed_type?: 'track' | 'playlist' | 'album' | 'artist';
    height?: number;
    theme?: 'dark' | 'light';
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'spotify',
        p_widget_data: {
          spotify_url: spotify.spotify_url,
          embed_type: spotify.embed_type || 'playlist',
          height: spotify.height || 380,
          theme: spotify.theme || 'dark'
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a Spotify widget
   */
  async updateSpotifyWidget(widgetId: string, data: {
    spotify_url?: string;
    embed_type?: 'track' | 'playlist' | 'album' | 'artist';
    height?: number;
    theme?: 'dark' | 'light';
  }): Promise<void> {
    const { error } = await supabase
      .from('widget_spotify')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new Calendar widget
   */
  async createCalendarWidget(profileId: string, calendar: {
    calendly_url: string;
    title?: string;
    hide_event_details?: boolean;
    hide_cookie_banner?: boolean;
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'calendar',
        p_widget_data: {
          calendly_url: calendar.calendly_url,
          title: calendar.title || 'Schedule a meeting',
          hide_event_details: calendar.hide_event_details ?? false,
          hide_cookie_banner: calendar.hide_cookie_banner ?? true
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a Calendar widget
   */
  async updateCalendarWidget(widgetId: string, data: {
    calendly_url?: string;
    title?: string;
    hide_event_details?: boolean;
    hide_cookie_banner?: boolean;
  }): Promise<void> {
    const { error } = await supabase
      .from('widget_calendar')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new Separator widget
   */
  async createSeparatorWidget(profileId: string, separator: {
    style?: 'solid' | 'dashed' | 'dotted';
    thickness?: number;
    color?: string;
    margin_top?: number;
    margin_bottom?: number;
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'separator',
        p_widget_data: {
          style: separator.style || 'solid',
          thickness: separator.thickness || 1,
          color: separator.color || '#cccccc',
          margin_top: separator.margin_top || 20,
          margin_bottom: separator.margin_bottom || 20
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a Separator widget
   */
  async updateSeparatorWidget(widgetId: string, data: {
    style?: 'solid' | 'dashed' | 'dotted';
    thickness?: number;
    color?: string;
    margin_top?: number;
    margin_bottom?: number;
  }): Promise<void> {
    const { error } = await supabase
      .from('widget_separator')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new Title widget
   */
  async createTitleWidget(profileId: string, title: {
    text: string;
    font_size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
    text_align?: 'left' | 'center' | 'right';
    font_weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  }): Promise<string> {
    const { data: widgetId, error } = await supabase
      .rpc('create_widget', {
        p_profile_id: profileId,
        p_widget_type: 'title',
        p_widget_data: {
          text: title.text,
          font_size: title.font_size || 'xl',
          text_align: title.text_align || 'center',
          font_weight: title.font_weight || 'bold'
        }
      });

    if (error) throw error;
    return widgetId;
  }

  /**
   * Update a Title widget
   */
  async updateTitleWidget(widgetId: string, data: {
    text?: string;
    font_size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
    text_align?: 'left' | 'center' | 'right';
    font_weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  }): Promise<void> {
    const { error } = await supabase
      .from('widget_title')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * TEMPORARY FIX: Sync widgets for profiles where widgets exist in individual tables
   * but are not registered in the profile.widgets array
   */
  async syncProfileWidgets(profileId: string): Promise<void> {
    // Get current profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('widgets')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      throw new Error('Profile not found');
    }

    // If widgets array already has entries, skip sync
    if (profile.widgets && profile.widgets.length > 0) {
      return;
    }

    const widgetEntries = [];
    let position = 0;

    // Sync all widget types - RLS policies will handle filtering
    const widgetTables = [
      { table: 'widget_links', type: 'link' },
      { table: 'widget_agents', type: 'agents' },
      { table: 'widget_gallery', type: 'gallery' },
      { table: 'widget_youtube', type: 'youtube' },
      { table: 'widget_maps', type: 'maps' },
      { table: 'widget_spotify', type: 'spotify' },
      { table: 'widget_calendar', type: 'calendar' },
      { table: 'widget_separator', type: 'separator' },
      { table: 'widget_title', type: 'title' }
    ];

    for (const { table, type } of widgetTables) {
      const { data: widgets } = await supabase
        .from(table)
        .select('id, created_at')
        .order('created_at', { ascending: true });

      if (widgets && widgets.length > 0) {
        for (const widget of widgets) {
          widgetEntries.push({
            id: widget.id,
            type: type,
            position: position++,
            is_active: true
          });
        }
      }
    }

    // Update profile with synced widgets
    if (widgetEntries.length > 0) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          widgets: widgetEntries,
          updated_at: new Date().toISOString()
        })
        .eq('id', profileId);

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ Synced ${widgetEntries.length} widgets to profile.widgets array`);
    } else {
      console.log('ℹ️ No widgets found to sync');
    }
  }
}

export const profileApi = new ProfileAPI();