// src/features/public-profile/components/PublicContentComponent.tsx - Updated with compact spacing
import { cn } from '@/lib/utils'
import { ProfileWithAgents, Widget } from '@/types/profile'
import { WidgetType } from '@/types/widget'
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

  // 1. Get all widgets from individual arrays and flatten them
  const allWidgetsRaw = [
    ...(profile.linkWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Link, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.agentWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Agents, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.galleryWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Gallery, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.youtubeWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.YouTube, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.mapsWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Maps, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.spotifyWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Spotify, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.calendarWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Calendar, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.separatorWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Separator, position: w.position, is_active: w.is_active } as Widget })),
    ...(profile.titleWidgets || []).map((w: any) => ({ data: w, widget: { id: w.id, type: WidgetType.Title, position: w.position, is_active: w.is_active } as Widget })),
  ];

  // 2. Sort and filter
  const activeWidgets = allWidgetsRaw
    .filter(item => item.widget.is_active)
    .sort((a, b) => a.widget.position - b.widget.position)
    .map(item => {
      // Special logic for agents to include full details
      if (item.widget.type === WidgetType.Agents) {
        const agentData = item.data as any;
        const agents = (agentData.agent_ids || [])
          .map((id: string) => profile.agentDetails?.find(a => a.id === id))
          .filter(Boolean)
          .map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            description: agent.description,
            icon: agent.icon
          }));

        return {
          ...item,
          data: {
            ...agentData,
            agents,
            onAgentClick
          }
        };
      }
      return item;
    }) as ActiveWidget[];

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