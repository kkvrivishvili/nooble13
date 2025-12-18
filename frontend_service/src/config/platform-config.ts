// src/config/platform-configs.ts
import { 
    IconLink,
    IconBrandYoutube,
    IconMusic,
    IconCalendar,
    IconMapPin,
    IconBrandInstagram,
    IconBrandTiktok,
    IconBrandX,
    IconBrandLinkedin,
    IconBrandFacebook,
    IconBrandSpotify
  } from '@tabler/icons-react';
  import { SocialPlatformConfig, LinkTypeConfig } from '@/types/profile';
  
  // Social platform configurations
  export const socialPlatformConfigs: SocialPlatformConfig[] = [
    {
      platform: 'instagram',
      label: 'Instagram',
      icon: IconBrandInstagram,
      urlPattern: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?$/,
      placeholder: 'https://instagram.com/username',
      baseUrl: 'https://instagram.com/',
    },
    {
      platform: 'tiktok',
      label: 'TikTok',
      icon: IconBrandTiktok,
      urlPattern: /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9._-]+\/?$/,
      placeholder: 'https://tiktok.com/@username',
      baseUrl: 'https://tiktok.com/@',
    },
    {
      platform: 'youtube',
      label: 'YouTube',
      icon: IconBrandYoutube,
      urlPattern: /^https?:\/\/(www\.)?youtube\.com\/(c|channel|user)\/[a-zA-Z0-9._-]+\/?$/,
      placeholder: 'https://youtube.com/c/channel',
      baseUrl: 'https://youtube.com/c/',
    },
    {
      platform: 'twitter',
      label: 'Twitter/X',
      icon: IconBrandX,
      urlPattern: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9._-]+\/?$/,
      placeholder: 'https://twitter.com/username',
      baseUrl: 'https://twitter.com/',
    },
    {
      platform: 'linkedin',
      label: 'LinkedIn',
      icon: IconBrandLinkedin,
      urlPattern: /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9._-]+\/?$/,
      placeholder: 'https://linkedin.com/in/username',
      baseUrl: 'https://linkedin.com/in/',
    },
    {
      platform: 'facebook',
      label: 'Facebook',
      icon: IconBrandFacebook,
      urlPattern: /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?$/,
      placeholder: 'https://facebook.com/username',
      baseUrl: 'https://facebook.com/',
    },
    {
      platform: 'spotify',
      label: 'Spotify',
      icon: IconBrandSpotify,
      urlPattern: /^https?:\/\/(open\.)?spotify\.com\/(artist|user|playlist)\/[a-zA-Z0-9]+(\?.*)?$/,
      placeholder: 'https://open.spotify.com/artist/...',
      baseUrl: 'https://open.spotify.com/',
    },
  ];
  
  // Link type configurations
  export const linkTypeConfigs: LinkTypeConfig[] = [
    {
      type: 'url',
      label: 'Enlace Web',
      icon: '🔗',
      urlPattern: /^https?:\/\/.+$/,
      placeholder: 'https://ejemplo.com',
    },
    {
      type: 'youtube',
      label: 'YouTube',
      icon: '▶️',
      urlPattern: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+$/,
      placeholder: 'https://youtube.com/watch?v=...',
    },
    {
      type: 'spotify',
      label: 'Spotify',
      icon: '🎶',
      urlPattern: /^https?:\/\/(open\.)?spotify\.com\/.+$/,
      placeholder: 'https://open.spotify.com/track/...',
    },
    {
      type: 'calendly',
      label: 'Calendly',
      icon: '📅',
      urlPattern: /^https?:\/\/calendly\.com\/.+$/,
      placeholder: 'https://calendly.com/username',
    },
    {
      type: 'google-calendar',
      label: 'Google Calendar',
      icon: '📅',
      urlPattern: /^https?:\/\/calendar\.google\.com\/.+$/,
      placeholder: 'https://calendar.google.com/calendar/...',
    },
    {
      type: 'google-maps',
      label: 'Google Maps',
      icon: '📍',
      urlPattern: /^https?:\/\/(www\.)?google\.com\/maps\/.+$/,
      placeholder: 'https://maps.google.com/...',
    },
  ];
  
  // Icon mappings for components
  export const socialPlatformIcons = {
    instagram: IconBrandInstagram,
    tiktok: IconBrandTiktok,
    youtube: IconBrandYoutube,
    twitter: IconBrandX,
    linkedin: IconBrandLinkedin,
    facebook: IconBrandFacebook,
    spotify: IconBrandSpotify,
  };
  
  export const linkTypeIcons = {
    url: IconLink,
    youtube: IconBrandYoutube,
    spotify: IconMusic,
    calendly: IconCalendar,
    'google-calendar': IconCalendar,
    'google-maps': IconMapPin,
  };
  
  // Validation helpers
  export function validateSocialUrl(platform: string, url: string): boolean {
    const config = socialPlatformConfigs.find(p => p.platform === platform);
    if (!config) return false;
    return config.urlPattern.test(url);
  }
  
  export function validateLinkUrl(type: string, url: string): boolean {
    const config = linkTypeConfigs.find(t => t.type === type);
    if (!config) return /^https?:\/\/.+$/.test(url); // Default URL validation
    return config.urlPattern ? config.urlPattern.test(url) : /^https?:\/\/.+$/.test(url);
  }
  
  export function getSocialPlatformConfig(platform: string): SocialPlatformConfig | undefined {
    return socialPlatformConfigs.find(p => p.platform === platform);
  }
  
  export function getLinkTypeConfig(type: string): LinkTypeConfig | undefined {
    return linkTypeConfigs.find(t => t.type === type);
  }
  
  // Helper to get available platforms (not already used)
  export function getAvailableSocialPlatforms(existingPlatforms: string[]): SocialPlatformConfig[] {
    return socialPlatformConfigs.filter(
      config => !existingPlatforms.includes(config.platform)
    );
  }