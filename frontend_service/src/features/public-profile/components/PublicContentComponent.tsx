// src/features/public-profile/components/PublicContentComponent.tsx - Updated with compact spacing
import { cn } from '@/lib/utils'
import { ProfileWithAgents, Widget } from '@/types/profile'
import { PublicWidgetRenderer } from '@/features/public-profile/widgets/public-widget-renderer'
import { useProfileTheme } from '@/context/profile-theme-context'

interface ActiveWidget {
  widget: Widget;
  data: Record<string, unknown>;
}

interface PublicContentComponentProps {
  profile: ProfileWithAgents
  onAgentClick?: (agentId: string) => void
}

export default function PublicContentComponent({ 
  profile, 
  onAgentClick
}: PublicContentComponentProps) {
  const { theme, layout } = useProfileTheme();

  if (!profile) {
    return <div>Loading...</div>;
  }

  // Get active widgets with their data
  const activeWidgets = profile.widgets
    .filter(widget => widget.is_active)
    .map(widget => {
      switch (widget.type) {
        case 'link': {
          const linkData = profile.linkWidgets?.find(l => l.id === widget.id);
          return linkData ? { widget, data: linkData } : null;
        }
        case 'agents': {
          const agentData = profile.agentWidgets?.find(w => w.id === widget.id);
          if (agentData) {
            const agents = agentData.agent_ids
              .map(id => profile.agentDetails.find(a => a.id === id))
              .filter(Boolean)
              .map(agent => ({
                id: agent!.id,
                name: agent!.name,
                description: agent!.description,
                icon: agent!.icon
              }));
            
            return {
              widget,
              data: {
                ...agentData,
                agents,
                onAgentClick
              }
            };
          }
          return null;
        }
        case 'separator': {
          const separatorData = profile.separatorWidgets?.find(w => w.id === widget.id);
          return separatorData ? { widget, data: separatorData } : null;
        }
        case 'title': {
          const titleData = profile.titleWidgets?.find(w => w.id === widget.id);
          return titleData ? { widget, data: titleData } : null;
        }
        case 'gallery': {
          const galleryData = profile.galleryWidgets?.find(w => w.id === widget.id);
          return galleryData ? { widget, data: galleryData } : null;
        }
        case 'youtube': {
          const youtubeData = profile.youtubeWidgets?.find(w => w.id === widget.id);
          return youtubeData ? { widget, data: youtubeData } : null;
        }
        case 'maps': {
          const mapsData = profile.mapsWidgets?.find(w => w.id === widget.id);
          return mapsData ? { widget, data: mapsData } : null;
        }
        case 'spotify': {
          const spotifyData = profile.spotifyWidgets?.find(w => w.id === widget.id);
          return spotifyData ? { widget, data: spotifyData } : null;
        }
        case 'calendar': {
          const calendarData = profile.calendarWidgets?.find(w => w.id === widget.id);
          return calendarData ? { widget, data: calendarData } : null;
        }
        default:
          return null;
      }
    })
    ?.filter(Boolean) as ActiveWidget[] || [];

  // Definir estilos de contenedor basados en el tema
  const getContainerStyles = () => {
    return {
      borderRadius: theme.border_radius === 'sharp' ? '0.5rem' :
                   theme.border_radius === 'curved' ? '0.75rem' : '1rem',
    };
  };

  return (
    <div className={cn(
      "w-full mx-auto px-4",
      layout.content_width === 'narrow' && 'max-w-md',
      layout.content_width === 'normal' && 'max-w-xl',
      layout.content_width === 'wide' && 'max-w-3xl'
    )}>
      {/* Contenido de Widgets - Always compact spacing */}
      <div className="space-y-2" style={getContainerStyles()}>
        {activeWidgets.map(({ widget, data }, index) => (
          <div 
            key={widget.id}
            className="profile-animate-in"
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <PublicWidgetRenderer
              widget={widget}
              data={data}
              theme={theme}
              onAgentClick={onAgentClick}
            />
          </div>
        ))}
      </div>
    </div>
  );
}