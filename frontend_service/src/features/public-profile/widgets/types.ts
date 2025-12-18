// src/features/public-profile/widgets/types.ts - Fixed snake_case
import { ProfileTheme } from '@/types/profile';

export interface PublicWidgetProps {
    id: string;
    className?: string;
    theme?: ProfileTheme; // Aplicar theme del profile
    title: string;
    url: string;
    description?: string;
    icon?: string;
    agents?: Array<{
      id: string;
      name: string;
      description?: string;
      icon: string;
    }>;
    display_style?: 'card' | 'list' | 'bubble';
    onAgentClick?: (agentId: string) => void;
  }
  
  export interface PublicLinkWidgetData {
    title: string;
    url: string;
    description?: string;
    icon?: string;
  }
  
  export interface PublicAgentsWidgetData {
    title: string;
    agents: Array<{
      id: string;
      name: string;
      description?: string;
      icon: string;
    }>;
    display_style: 'card' | 'list' | 'bubble';
    onAgentClick?: (agentId: string) => void;
  }