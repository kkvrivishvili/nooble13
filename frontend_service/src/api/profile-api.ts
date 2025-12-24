// src/api/profile-api.ts - FIXED SNAKE_CASE VERSION
// This version uses correct snake_case table names

import { supabase } from '@/lib/supabase';
import {
  Profile,
  ProfileWithAgents,
  ProfileUpdatePayload,
  ProfileLink,
} from '@/types/profile';

class ProfileAPI {
  /**
   * Get the current user's profile with all related data
   * V6.0: Widgets are queried directly from tables using user_id
   */
  async getMyProfile(): Promise<ProfileWithAgents | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get base profile (no longer contains widgets/agents arrays)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return null;
    }

    // Get agents directly from agents table
    const { data: agentDetails } = await supabase
      .from('agents_with_prompt')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // Fetch all widget data using the V6 RPC function
    const { data: allWidgets, error: widgetsError } = await supabase
      .rpc('get_user_widgets_ordered', {
        p_user_id: user.id,
        p_active_only: false // Get all for management
      });

    if (widgetsError) {
      console.error('Error fetching widgets via RPC:', widgetsError);
    }

    // Map the unified list into specific arrays for the frontend
    const widgets = allWidgets || [];

    const linkWidgets = widgets.filter((w: any) => w.widget_type === 'link').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const agentWidgets = widgets.filter((w: any) => w.widget_type === 'agents').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const galleryWidgets = widgets.filter((w: any) => w.widget_type === 'gallery').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const youtubeWidgets = widgets.filter((w: any) => w.widget_type === 'youtube').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const mapsWidgets = widgets.filter((w: any) => w.widget_type === 'maps').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const spotifyWidgets = widgets.filter((w: any) => w.widget_type === 'spotify').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const calendarWidgets = widgets.filter((w: any) => w.widget_type === 'calendar').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const separatorWidgets = widgets.filter((w: any) => w.widget_type === 'separator').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));
    const titleWidgets = widgets.filter((w: any) => w.widget_type === 'title').map((w: any) => ({ ...w.data, id: w.id, position: w.position, is_active: w.is_active, created_at: w.created_at, updated_at: w.updated_at }));

    // Construct the full profile
    const fullProfile: ProfileWithAgents = {
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createLinkWidget(userId: string, link: Omit<ProfileLink, 'id' | 'created_at' | 'user_id' | 'position' | 'is_active' | 'updated_at'>): Promise<string> {
    // Get next position
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_link')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        title: link.title,
        url: link.url,
        description: link.description,
        icon: link.icon
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  /**
   * Update a link widget
   */
  async updateLinkWidget(widgetId: string, data: Partial<ProfileLink>): Promise<void> {
    const { error } = await supabase
      .from('widget_link')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Delete a widget from its table
   * V6.0: Widgets are deleted directly, no profiles.widgets to update
   */
  async deleteWidget(userId: string, widgetId: string, widgetType: string): Promise<void> {
    const tableName = `widget_${widgetType === 'agents' ? 'agents' : widgetType}`;

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', widgetId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Reorder widgets by updating their position field
   * V6.0: Updates position directly in widget tables
   */
  async reorderWidgets(userId: string, widgets: { id: string; type: string; position: number }[]): Promise<void> {
    // Update each widget's position
    for (const widget of widgets) {
      const tableName = `widget_${widget.type === 'agents' ? 'agents' : widget.type}`;

      const { error } = await supabase
        .from(tableName)
        .update({ position: widget.position })
        .eq('id', widget.id)
        .eq('user_id', userId);

      if (error) throw error;
    }
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createAgentsWidget(userId: string, agentsData: {
    title: string;
    agent_ids: string[];
    display_style: 'card' | 'list' | 'bubble';
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_agents')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        title: agentsData.title,
        agent_ids: agentsData.agent_ids,
        display_style: agentsData.display_style
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createGalleryWidget(userId: string, gallery: {
    title?: string;
    products: string[];
    show_price?: boolean;
    show_description?: boolean;
    columns?: number;
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_gallery')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        title: gallery.title || '',
        products: gallery.products || [],
        show_price: gallery.show_price ?? true,
        show_description: gallery.show_description ?? true,
        columns: gallery.columns || 3
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createYouTubeWidget(userId: string, youtube: {
    video_url: string;
    title?: string;
    autoplay?: boolean;
    show_controls?: boolean;
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_youtube')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        video_url: youtube.video_url,
        title: youtube.title || '',
        autoplay: youtube.autoplay ?? false,
        show_controls: youtube.show_controls ?? true
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createMapsWidget(userId: string, maps: {
    address: string;
    latitude?: number;
    longitude?: number;
    zoom_level?: number;
    map_style?: string;
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_map')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        address: maps.address,
        latitude: maps.latitude,
        longitude: maps.longitude,
        zoom_level: maps.zoom_level || 15,
        map_style: maps.map_style || 'roadmap'
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
      .from('widget_map')
      .update(data)
      .eq('id', widgetId);

    if (error) throw error;
  }

  /**
   * Create a new Spotify widget
   * V6.0: Uses INSERT with user_id and position
   */
  async createSpotifyWidget(userId: string, spotify: {
    spotify_url: string;
    embed_type?: 'track' | 'playlist' | 'album' | 'artist';
    height?: number;
    theme?: 'dark' | 'light';
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_spotify')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        spotify_url: spotify.spotify_url,
        embed_type: spotify.embed_type || 'playlist',
        height: spotify.height || 380,
        theme: spotify.theme || 'dark'
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createCalendarWidget(userId: string, calendar: {
    calendly_url: string;
    title?: string;
    hide_event_details?: boolean;
    hide_cookie_banner?: boolean;
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_calendar')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        calendly_url: calendar.calendly_url,
        title: calendar.title || 'Schedule a meeting',
        hide_event_details: calendar.hide_event_details ?? false,
        hide_cookie_banner: calendar.hide_cookie_banner ?? true
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createSeparatorWidget(userId: string, separator: {
    style?: 'solid' | 'dashed' | 'dotted';
    thickness?: number;
    color?: string;
    margin_top?: number;
    margin_bottom?: number;
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_separator')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        style: separator.style || 'solid',
        thickness: separator.thickness || 1,
        color: separator.color || '#cccccc',
        margin_top: separator.margin_top || 20,
        margin_bottom: separator.margin_bottom || 20
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
   * V6.0: Uses INSERT with user_id and position
   */
  async createTitleWidget(userId: string, title: {
    text: string;
    font_size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
    text_align?: 'left' | 'center' | 'right';
    font_weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  }): Promise<string> {
    const { data: nextPos } = await supabase.rpc('get_next_widget_position', { p_user_id: userId });

    const { data, error } = await supabase
      .from('widget_title')
      .insert({
        user_id: userId,
        position: nextPos || 0,
        is_active: true,
        text: title.text,
        font_size: title.font_size || 'xl',
        text_align: title.text_align || 'center',
        font_weight: title.font_weight || 'bold'
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
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
}

export const profileApi = new ProfileAPI();