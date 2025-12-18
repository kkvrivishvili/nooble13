// src/features/public-profile/components/ProfileComponent.tsx - Fixed snake_case
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Profile } from '@/types/profile'
import { useProfileTheme } from '@/context/profile-theme-context'
import SocialLinks from './SocialLinks'

interface ProfileComponentProps {
  profile: Profile
  isPreview?: boolean
  showSocialLinks?: boolean
}

export default function ProfileComponent({ 
  profile, 
  isPreview = false,
  showSocialLinks = false 
}: ProfileComponentProps) {
  const { theme, layout } = useProfileTheme();

  return (
    <div 
      className={cn(
        "w-full mx-auto px-4 pt-8 pb-4",
        layout.content_width === 'narrow' && 'max-w-md',
        layout.content_width === 'normal' && 'max-w-xl',
        layout.content_width === 'wide' && 'max-w-3xl'
      )}
      style={{
        fontFamily: theme.font_family === 'serif' ? 'serif' :
                   theme.font_family === 'mono' ? 'monospace' : 'sans-serif'
      }}
    >
      {/* Avatar y Nombre */}
      <div className={cn(
        "flex items-center gap-4 mb-3", // Always compact spacing
        isPreview && "scale-95"
      )}>
        <Avatar className={cn(
          "transition-all duration-300 rounded-full",
          isPreview ? "h-16 w-16" : "h-20 w-20"
        )}
        >
          <AvatarImage src={profile.avatar} className="rounded-full" />
          <AvatarFallback 
            className="font-bold rounded-full"
            style={{ 
              backgroundColor: theme.primary_color,
              color: theme.button_text_color || '#ffffff'
            }}
          >
            {profile.display_name
              ? profile.display_name.split(' ').map((n: string) => n[0]).join('')
              : 'NN'}
          </AvatarFallback>
        </Avatar>
        
        <h1 className={cn(
          "font-semibold transition-all duration-300",
          isPreview ? "text-xl" : "text-2xl"
        )}
        style={{ 
          color: theme.text_color || theme.primary_color,
        }}
        >
          {profile.display_name}
        </h1>
      </div>
      
      {/* Descripción */}
      <p className={cn(
        "transition-all duration-300 mb-4", // Always compact spacing
        isPreview && "text-sm"
      )}
      style={{ 
        color: theme.text_color || theme.primary_color,
        opacity: 0.8,
      }}
      >
        {profile.description}
      </p>
      
      {/* Social Links */}
      {showSocialLinks && (
        <SocialLinks 
          social_links={profile.social_links || []}
          isPreview={isPreview}
          position="top"
          iconSize={20}
        />
      )}
    </div>
  );
}