// src/features/public-profile/components/SocialLinks.tsx - Consolidated social links component
import { cn } from '@/lib/utils'
import { SocialLink } from '@/types/profile'
import { useProfileTheme } from '@/context/profile-theme-context'
import { getButtonStyles, getBorderRadius } from '@/features/public-profile/utils/theme-styles'
import { 
  IconBrandInstagram, 
  IconBrandTiktok, 
  IconBrandYoutube, 
  IconBrandX,
  IconBrandLinkedin,
  IconBrandFacebook,
  IconBrandSpotify,
  IconLink
} from '@tabler/icons-react'
import { ComponentType } from 'react'

const socialIcons: Record<string, ComponentType<{ size: number; strokeWidth: number; className?: string }>> = {
  instagram: IconBrandInstagram,
  tiktok: IconBrandTiktok,
  youtube: IconBrandYoutube,
  twitter: IconBrandX,
  linkedin: IconBrandLinkedin,
  facebook: IconBrandFacebook,
  spotify: IconBrandSpotify,
}

interface SocialLinksProps {
  socialLinks?: SocialLink[]
  social_links?: SocialLink[]
  isPreview?: boolean
  position?: 'top' | 'bottom'
  className?: string
  iconSize?: number
  noBackground?: boolean
  noShadow?: boolean
}

export default function SocialLinks({ 
  socialLinks, 
  social_links,
  isPreview = false, 
  position = 'top',
  className = '',
  iconSize = 20,
  noBackground = false,
  noShadow = false
}: SocialLinksProps) {
  const { theme, layout } = useProfileTheme()
  
  // Get social button styles - use widget link style or minimal style
  const socialButtonStyles = noBackground ? {
    backgroundColor: 'transparent',
    border: 'none',
    boxShadow: noShadow ? 'none' : undefined,
    color: theme.text_color || theme.primary_color,
    borderRadius: getBorderRadius(theme),
    transition: 'all 0.2s ease',
  } : getButtonStyles(theme, 'secondary')
  
  const links = socialLinks ?? social_links ?? []
  if (!links.length) return null

  return (
    <div className={cn(
      "flex gap-3 transition-all duration-300",
      position === 'bottom' && layout.social_position === 'bottom' && 'justify-center',
      className
    )}>
      {links.map((link) => {
        const Icon = socialIcons[link.platform] || IconLink
        return (
          <a
            key={link.platform}
            href={isPreview ? undefined : link.url}
            target={isPreview ? undefined : "_blank"}
            rel={isPreview ? undefined : "noopener noreferrer"}
            className={cn(
              "p-2 transition-all duration-200 hover:scale-110 active:scale-95",
              isPreview && "cursor-default"
            )}
            style={socialButtonStyles}
            onClick={isPreview ? (e) => e.preventDefault() : undefined}
            onMouseEnter={(e) => {
              if (noBackground) {
                e.currentTarget.style.transform = 'scale(1.1)'
                e.currentTarget.style.color = theme.primary_color
              } else if (theme.button_fill === 'outline') {
                e.currentTarget.style.backgroundColor = theme.primary_color
                e.currentTarget.style.color = theme.button_text_color || '#ffffff'
              } else if (theme.button_fill === 'glass') {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
              } else {
                e.currentTarget.style.transform = 'scale(1.1)'
              }
            }}
            onMouseLeave={(e) => {
              Object.assign(e.currentTarget.style, socialButtonStyles)
              e.currentTarget.style.transform = ''
            }}
          >
            <Icon 
              size={isPreview ? Math.max(16, iconSize - 2) : iconSize} 
              strokeWidth={1.5} 
            />
          </a>
        )
      })}
    </div>
  )
}
