// src/types/widget.ts
import { IconComponent } from './profile';

// Base widget interface
export interface BaseWidget {
  id: string;
  type: WidgetType;
  position: number;
  is_active: boolean;
}

// Widget types enum
export enum WidgetType {
  Link = 'link',
  Agents = 'agents',
  Gallery = 'gallery',
  YouTube = 'youtube',
  Maps = 'maps',
  Spotify = 'spotify',
  Calendar = 'calendar',
  Separator = 'separator',
  Title = 'title',
}

// Main Widget interface used in profiles
export interface Widget {
  id: string;
  type: WidgetType;
  position: number;
  is_active: boolean;
}

// Widget data wrapper
export interface WidgetData<T = unknown> {
  widget: Widget;
  data: T;
}

// Specific widget data types (for forms/editors)
export interface LinkWidgetData {
  title: string;
  url: string;
  description?: string;
  icon?: string;
}

export interface AgentsWidgetData {
  title: string;
  agent_ids: string[];
  display_style: 'card' | 'list' | 'bubble';
}

export interface GalleryWidgetData {
  title?: string;
  products: string[];
  show_price: boolean;
  show_description: boolean;
  columns: number;
}

export interface YouTubeWidgetData {
  video_url: string;
  title?: string;
  autoplay: boolean;
  show_controls: boolean;
}

export interface MapsWidgetData {
  address: string;
  latitude?: number;
  longitude?: number;
  zoom_level: number;
  map_style: string;
}

export interface SpotifyWidgetData {
  spotify_url: string;
  embed_type: 'track' | 'playlist' | 'album' | 'artist';
  height: number;
  theme: 'dark' | 'light';
}

export interface CalendarWidgetData {
  calendly_url: string;
  title: string;
  hide_event_details: boolean;
  hide_cookie_banner: boolean;
}

export interface SeparatorWidgetData {
  style: 'solid' | 'dashed' | 'dotted';
  thickness: number;
  color: string;
  margin_top: number;
  margin_bottom: number;
}

export interface TitleWidgetData {
  text: string;
  font_size: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  text_align: 'left' | 'center' | 'right';
  font_weight: 'normal' | 'medium' | 'semibold' | 'bold';
}

// Union type for all widget data
export type AnyWidgetData = 
  | LinkWidgetData
  | AgentsWidgetData
  | GalleryWidgetData
  | YouTubeWidgetData
  | MapsWidgetData
  | SpotifyWidgetData
  | CalendarWidgetData
  | SeparatorWidgetData
  | TitleWidgetData;

// Widget configuration
export interface WidgetConfig<T = unknown> {
  type: WidgetType;
  label: string;
  description: string;
  icon: IconComponent;
  defaultData: T;
  validator: (data: T) => ValidationResult;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: Record<string, string>;
}

// Widget component props
export interface WidgetComponentProps<T = unknown> {
  widget: Widget;
  data: T;
  is_editing: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onUpdate?: (data: T) => Promise<void>;
}

export interface WidgetEditorProps<T = unknown> {
  data?: T;
  onSave: (data: T) => Promise<void>;
  onCancel: () => void;
  is_loading?: boolean;
}

// Drag and drop types
export interface DraggableWidgetProps {
  widget: Widget;
  children: React.ReactNode;
  disabled?: boolean;
}

export interface DroppableWidgetAreaProps {
  widgets: Widget[];
  onReorder: (widgets: Widget[]) => Promise<void>;
  children: React.ReactNode;
}

// Type guards
export function isLinkWidget(data: AnyWidgetData): data is LinkWidgetData {
  return 'url' in data && 'title' in data;
}

export function isAgentsWidget(data: AnyWidgetData): data is AgentsWidgetData {
  return 'agent_ids' in data && 'display_style' in data;
}

export function isGalleryWidget(data: AnyWidgetData): data is GalleryWidgetData {
  return 'products' in data && 'columns' in data;
}

export function isYouTubeWidget(data: AnyWidgetData): data is YouTubeWidgetData {
  return 'video_url' in data && 'autoplay' in data;
}

export function isMapsWidget(data: AnyWidgetData): data is MapsWidgetData {
  return 'address' in data && 'zoom_level' in data;
}

export function isSpotifyWidget(data: AnyWidgetData): data is SpotifyWidgetData {
  return 'spotify_url' in data && 'embed_type' in data;
}

export function isCalendarWidget(data: AnyWidgetData): data is CalendarWidgetData {
  return 'calendly_url' in data && 'hide_event_details' in data;
}

export function isSeparatorWidget(data: AnyWidgetData): data is SeparatorWidgetData {
  return 'style' in data && 'thickness' in data && 'margin_top' in data;
}

export function isTitleWidget(data: AnyWidgetData): data is TitleWidgetData {
  return 'text' in data && 'font_size' in data && 'text_align' in data;
}