// src/types/profile.ts - Updated types with snake_case convention
import React from 'react';
import { QueryObserverResult } from '@tanstack/react-query';
import { WidgetType } from './widget';

// Define IconComponent type for Tabler icons
export type IconComponent = React.ComponentType<{ size?: number; className?: string; }>;

export interface SocialLink {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'linkedin' | 'facebook' | 'spotify';
  url: string;
  icon?: string | IconComponent;
}

// Updated ProfileLink to match widget_links table
export interface ProfileLink {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  created_at?: string;
}

// Widget types
export interface Widget {
  id: string;
  type: WidgetType;
  position: number;
  is_active: boolean;
}

// Agent types - now normalized with snake_case
export interface AgentTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  system_prompt_template: string;
  default_query_config: {
    model: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
    stream: boolean;
  };
  default_rag_config: {
    embedding_model: string;
    embedding_dimensions: number;
    chunk_size: number;
    chunk_overlap: number;
    top_k: number;
    similarity_threshold: number;
    hybrid_search: boolean;
    rerank: boolean;
  };
  default_execution_config: {
    history_enabled: boolean;
    history_window: number;
    history_ttl: number;
    max_iterations: number;
    timeout_seconds: number;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Enhanced Design types
export interface ProfileTheme {
  // Colors
  primary_color: string;
  background_color: string;
  text_color?: string;
  button_text_color?: string;
  
  // Typography
  font_family?: 'sans' | 'serif' | 'mono';
  font_size?: 'sm' | 'md' | 'lg';
  
  // Styling
  border_radius?: 'sharp' | 'curved' | 'round';
  button_fill?: 'solid' | 'glass' | 'outline';
  button_shadow?: 'none' | 'subtle' | 'hard';
  
  // Wallpaper
  wallpaper?: ProfileWallpaper;
}

export interface ProfileWallpaper {
  type: 'fill' | 'gradient' | 'pattern' | 'image' | 'video';
  
  // Fill type
  fill_color?: string;
  
  // Gradient type
  gradient_colors?: string[];
  gradient_direction?: 'up' | 'down' | 'left' | 'right' | 'diagonal';
  gradient_type?: 'linear' | 'radial';
  
  // Pattern type
  pattern_type?: 'dots' | 'lines' | 'grid' | 'waves' | 'circles';
  pattern_color?: string;
  pattern_opacity?: number;
  pattern_blur?: boolean;
  pattern_blur_intensity?: number;
  
  // Image type
  image_url?: string;
  image_position?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  image_size?: 'cover' | 'contain' | 'auto';
  image_overlay?: string; // rgba color for overlay
  image_blur?: boolean;
  image_blur_intensity?: number;
  
  // Video type
  video_url?: string;
  video_muted?: boolean;
  video_loop?: boolean;
  video_overlay?: string;
  video_blur?: boolean;
  video_blur_intensity?: number;
}

export interface ProfileLayout {
  social_position?: 'top' | 'bottom' | 'hidden';
  content_width?: 'narrow' | 'normal' | 'wide';
}

export interface ProfileDesign {
  theme: ProfileTheme;
  layout?: ProfileLayout;
  version?: number; // For migration purposes
}

// Profile interface
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  description: string;
  avatar: string;
  social_links: SocialLink[];
  agents: string[]; // Array of agent UUIDs
  widgets: Widget[]; // Widget ordering and metadata
  design: ProfileDesign;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

// Widget-specific types matching database tables with snake_case
export interface WidgetLinks {
  id: string;
  profile_id: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  created_at: string;
}

export interface WidgetGallery {
  id: string;
  profile_id: string;
  title?: string;
  products: string[]; // Product IDs (jsonb)
  show_price: boolean;
  show_description: boolean;
  columns: number;
  created_at: string;
}

export interface WidgetAgents {
  id: string;
  profile_id: string;
  title: string;
  agent_ids: string[]; // Agent IDs (jsonb)
  display_style: 'card' | 'list' | 'bubble';
  created_at: string;
}

export interface WidgetYouTube {
  id: string;
  profile_id: string;
  video_url: string;
  title?: string;
  autoplay: boolean;
  show_controls: boolean;
  created_at: string;
}

export interface WidgetMaps {
  id: string;
  profile_id: string;
  address: string;
  latitude?: number;
  longitude?: number;
  zoom_level: number;
  map_style: string;
  created_at: string;
}

export interface WidgetSpotify {
  id: string;
  profile_id: string;
  spotify_url: string;
  embed_type: 'track' | 'playlist' | 'album' | 'artist';
  height: number;
  theme: 'dark' | 'light';
  created_at: string;
}

export interface WidgetCalendar {
  id: string;
  profile_id: string;
  calendly_url: string;
  title: string;
  hide_event_details: boolean;
  hide_cookie_banner: boolean;
  created_at: string;
}

export interface WidgetSeparator {
  id: string;
  profile_id: string;
  style: 'solid' | 'dashed' | 'dotted';
  thickness: number;
  color: string;
  margin_top: number;
  margin_bottom: number;
  created_at: string;
}

export interface WidgetTitle {
  id: string;
  profile_id: string;
  text: string;
  font_size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  text_align: 'left' | 'center' | 'right';
  font_weight: 'normal' | 'medium' | 'semibold' | 'bold';
  created_at: string;
}

// Full profile with populated data
export interface ProfileWithAgents extends Profile {
  agentDetails: Agent[]; // Full agent objects
  linkWidgets: WidgetLinks[]; // Links from widget_links table
  agentWidgets?: WidgetAgents[]; // Agent widgets data
  galleryWidgets?: WidgetGallery[]; // Gallery widgets data
  youtubeWidgets?: WidgetYouTube[]; // YouTube widgets data
  mapsWidgets?: WidgetMaps[]; // Maps widgets data
  spotifyWidgets?: WidgetSpotify[]; // Spotify widgets data
  calendarWidgets?: WidgetCalendar[]; // Calendar widgets data
  separatorWidgets?: WidgetSeparator[]; // Separator widgets data
  titleWidgets?: WidgetTitle[]; // Title widgets data
}

export interface ProfileContextType {
  profile: ProfileWithAgents | null;
  isLoading: boolean;
  isError: boolean;
  updateProfile: (payload: ProfileUpdatePayload) => void;
  updateProfileInfo: (data: { display_name?: string; description?: string; avatar?: string; }) => void;
  isUsernameAvailable: (username: string) => Promise<boolean>;
  // Link widget management
  addLinkWidget: (link: Omit<ProfileLink, 'id' | 'created_at' | 'profile_id'>) => void;
  updateLinkWidget: (id: string, data: Partial<Omit<ProfileLink, 'id' | 'profile_id'>>) => void;
  removeLinkWidget: (id: string) => void;
  reorderWidgets: (widgets: Widget[]) => void;
  // Social links (still in profile)
  addSocialLink: (socialLink: Omit<SocialLink, 'icon'>) => void;
  updateSocialLink: (platform: string, data: Partial<Omit<SocialLink, 'platform'>>) => void;
  removeSocialLink: (platform: string) => void;
  // Agent management
  createAgent: (templateId: string, name?: string) => Promise<Agent>;
  updateAgent: (agentId: string, data: Partial<Agent>) => Promise<void>;
  deleteAgent: (agentId: string) => Promise<void>;
  refreshProfile: () => Promise<QueryObserverResult<ProfileWithAgents | null>>;
}

// Sync status hook type
export interface SyncStatus {
  hasPendingChanges: boolean;
  pendingChangesCount: number;
  isOnline: boolean;
}

// API Request/Response types
export interface ProfileUpdatePayload {
  display_name?: string;
  description?: string;
  avatar?: string;
  social_links?: SocialLink[];
  design?: ProfileDesign;
  is_public?: boolean;
}

// Platform configurations
export interface SocialPlatformConfig {
  platform: SocialLink['platform'];
  label: string;
  icon?: string | IconComponent;
  urlPattern: RegExp;
  placeholder: string;
  baseUrl: string;
}

export interface LinkTypeConfig {
  type: string;
  label: string;
  icon: string | IconComponent;
  urlPattern?: RegExp;
  placeholder: string;
}

// Agent type with snake_case
export interface Agent {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  description?: string;
  icon: string;
  system_prompt?: string;
  system_prompt_override?: string;
  query_config: {
    model: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
    stream: boolean;
  };
  rag_config: {
    embedding_model: string;
    embedding_dimensions: number;
    chunk_size: number;
    chunk_overlap: number;
    top_k: number;
    similarity_threshold: number;
    hybrid_search: boolean;
    rerank: boolean;
  };
  execution_config: {
    history_enabled: boolean;
    history_window: number;
    history_ttl: number;
    max_iterations: number;
    timeout_seconds: number;
  };
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}