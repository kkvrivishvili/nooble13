// src/features/my-nooble/profile/components/widgets/widget-manager.tsx
import { useState, useEffect, useCallback } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  IconPlus,
  IconAlertCircle,
} from '@tabler/icons-react';
import { WidgetType, BaseWidget, LinkWidgetData, AgentsWidgetData, GalleryWidgetData, YouTubeWidgetData, MapsWidgetData, SpotifyWidgetData, CalendarWidgetData, SeparatorWidgetData, TitleWidgetData } from '@/types/widget';
import { useProfile } from '@/context/profile-context';
import { profileApi } from '@/api/profile-api';
import { WidgetDndProvider } from './providers/widget-dnd-provider';
import { LinkWidget } from './link/link-widget';
import { LinkEditor } from './link/link-editor';
import { AgentsWidget } from './agents/agents-widget';
import { AgentsEditor } from './agents/agents-editor';
import { GalleryWidget } from './gallery/gallery-widget';
import { GalleryEditor } from './gallery/gallery-editor';
import { YouTubeWidget } from './youtube/youtube-widget';
import { YouTubeEditor } from './youtube/youtube-editor';
import { MapsWidget } from './maps/maps-widget';
import { MapsEditor } from './maps/maps-editor';
import { SpotifyWidget } from './spotify/spotify-widget';
import { SpotifyEditor } from './spotify/spotify-editor';
import { CalendarWidget } from './calendar/calendar-widget';
import { CalendarEditor } from './calendar/calendar-editor';
import { SeparatorWidget } from './separator/separator-widget';
import { SeparatorEditor } from './separator/separator-editor';
import { TitleWidget } from './tittle/tittle-widget';
import { TitleEditor } from './tittle/tittle-editor';
import { WidgetSelector } from './widget-selector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface WidgetManagerProps {
  initialShowAddNew?: boolean;
}

export function WidgetManager({ initialShowAddNew = false }: WidgetManagerProps) {
  const { 
    profile, 
    refreshProfile 
  } = useProfile();
  
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(initialShowAddNew);
  const [showWidgetSelector, setShowWidgetSelector] = useState(false);
  const [selectedWidgetType, setSelectedWidgetType] = useState<WidgetType | null>(null);
  const [error, setError] = useState<string>('');

  // Effect to handle external trigger for widget selector
  const handleShowWidgetSelector = useCallback(() => {
    setShowWidgetSelector(true);
  }, []);

  useEffect(() => {
    // Listen for widget selector event from header button
    window.addEventListener('showWidgetSelector', handleShowWidgetSelector);
    
    return () => {
      window.removeEventListener('showWidgetSelector', handleShowWidgetSelector);
    };
  }, [handleShowWidgetSelector]);

  if (!profile) return null;

  // Get active widgets sorted by position
  const activeWidgets = profile.widgets
    .filter(w => w.is_active)
    .sort((a, b) => a.position - b.position);

  // Map widgets to their data
  const widgetsWithData = activeWidgets.map(widget => {
    switch (widget.type) {
      case WidgetType.Link: {
        const linkData = profile.linkWidgets?.find(l => l.id === widget.id);
        return linkData ? { widget, data: linkData, type: WidgetType.Link } : null;
      }
      case WidgetType.Agents: {
        const agentData = profile.agentWidgets?.find(w => w.id === widget.id);
        return agentData ? { widget, data: agentData, type: WidgetType.Agents } : null;
      }
      case WidgetType.Gallery: {
        const galleryData = profile.galleryWidgets?.find(w => w.id === widget.id);
        return galleryData ? { widget, data: galleryData, type: WidgetType.Gallery } : null;
      }
      case WidgetType.YouTube: {
        const youtubeData = profile.youtubeWidgets?.find(w => w.id === widget.id);
        return youtubeData ? { widget, data: youtubeData, type: WidgetType.YouTube } : null;
      }
      case WidgetType.Maps: {
        const mapsData = profile.mapsWidgets?.find(w => w.id === widget.id);
        return mapsData ? { widget, data: mapsData, type: WidgetType.Maps } : null;
      }
      case WidgetType.Spotify: {
        const spotifyData = profile.spotifyWidgets?.find(w => w.id === widget.id);
        return spotifyData ? { widget, data: spotifyData, type: WidgetType.Spotify } : null;
      }
      case WidgetType.Calendar: {
        const calendarData = profile.calendarWidgets?.find(w => w.id === widget.id);
        return calendarData ? { widget, data: calendarData, type: WidgetType.Calendar } : null;
      }
      case WidgetType.Separator: {
        const separatorData = profile.separatorWidgets?.find(w => w.id === widget.id);
        return separatorData ? { widget, data: separatorData, type: WidgetType.Separator } : null;
      }
      case WidgetType.Title: {
        const titleData = profile.titleWidgets?.find(w => w.id === widget.id);
        return titleData ? { widget, data: titleData, type: WidgetType.Title } : null;
      }
      default:
        return null;
    }
  }).filter(Boolean) as Array<{ widget: BaseWidget; data: any; type: WidgetType }>;

  // Widget type selection handler
  const handleWidgetTypeSelected = (type: WidgetType) => {
    setSelectedWidgetType(type);
    setShowWidgetSelector(false);
    setIsAddingNew(true);
  };

  // Save handlers for different widget types
  const handleSaveNewLink = async (data: LinkWidgetData) => {
    try {
      await profileApi.createLinkWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el widget');
    }
  };

  const handleSaveNewAgents = async (data: AgentsWidgetData) => {
    try {
      await profileApi.createAgentsWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el widget');
    }
  };

  const handleSaveNewGallery = async (data: GalleryWidgetData) => {
    try {
      await profileApi.createGalleryWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la galería');
    }
  };

  const handleSaveNewYouTube = async (data: YouTubeWidgetData) => {
    try {
      await profileApi.createYouTubeWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el widget de YouTube');
    }
  };

  const handleSaveNewMaps = async (data: MapsWidgetData) => {
    try {
      await profileApi.createMapsWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el widget de mapa');
    }
  };

  const handleSaveNewSpotify = async (data: SpotifyWidgetData) => {
    try {
      await profileApi.createSpotifyWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el widget de Spotify');
    }
  };

  const handleSaveNewCalendar = async (data: CalendarWidgetData) => {
    try {
      await profileApi.createCalendarWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el widget de calendario');
    }
  };

  const handleSaveNewSeparator = async (data: SeparatorWidgetData) => {
    try {
      await profileApi.createSeparatorWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el separador');
    }
  };

  const handleSaveNewTitle = async (data: TitleWidgetData) => {
    try {
      await profileApi.createTitleWidget(profile.id, data);
      await refreshProfile();
      setIsAddingNew(false);
      setSelectedWidgetType(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el título');
    }
  };

  // Update handlers
  const handleUpdateLink = async (widgetId: string, data: LinkWidgetData) => {
    try {
      await profileApi.updateLinkWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el widget');
    }
  };

  const handleUpdateAgents = async (widgetId: string, data: AgentsWidgetData) => {
    try {
      await profileApi.updateAgentsWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el widget');
    }
  };

  const handleUpdateGallery = async (widgetId: string, data: GalleryWidgetData) => {
    try {
      await profileApi.updateGalleryWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar la galería');
    }
  };

  const handleUpdateYouTube = async (widgetId: string, data: YouTubeWidgetData) => {
    try {
      await profileApi.updateYouTubeWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el widget de YouTube');
    }
  };

  const handleUpdateMaps = async (widgetId: string, data: MapsWidgetData) => {
    try {
      await profileApi.updateMapsWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el widget de mapa');
    }
  };

  const handleUpdateSpotify = async (widgetId: string, data: SpotifyWidgetData) => {
    try {
      await profileApi.updateSpotifyWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el widget de Spotify');
    }
  };

  const handleUpdateCalendar = async (widgetId: string, data: CalendarWidgetData) => {
    try {
      await profileApi.updateCalendarWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el widget de calendario');
    }
  };

  const handleUpdateSeparator = async (widgetId: string, data: SeparatorWidgetData) => {
    try {
      await profileApi.updateSeparatorWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el separador');
    }
  };

  const handleUpdateTitle = async (widgetId: string, data: TitleWidgetData) => {
    try {
      await profileApi.updateTitleWidget(widgetId, data);
      await refreshProfile();
      setEditingWidgetId(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el título');
    }
  };

  // Common handlers
  const handleDeleteWidget = async (widgetId: string, widgetType: string) => {
    try {
      await profileApi.deleteWidget(profile.id, widgetId, widgetType);
      await refreshProfile();
      setError('');
      if (editingWidgetId === widgetId) {
        setEditingWidgetId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el widget');
    }
  };

  const handleReorderWidgets = async (newWidgets: BaseWidget[]) => {
    try {
      const widgetIds = newWidgets.map(w => w.id);
      await profileApi.reorderWidgets(profile.id, widgetIds);
      await refreshProfile();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reordenar los widgets');
    }
  };

  const handleStartEdit = (widgetId: string) => {
    setEditingWidgetId(widgetId);
    setIsAddingNew(false);
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingWidgetId(null);
    setIsAddingNew(false);
    setSelectedWidgetType(null);
    setShowWidgetSelector(false);
    setError('');
  };

  const renderWidget = (widget: BaseWidget, data: any, type: WidgetType) => {
    const is_editing = editingWidgetId === widget.id;
    
    switch (type) {
      case WidgetType.Link:
        return is_editing ? (
          <LinkEditor
            key={widget.id}
            data={data as LinkWidgetData}
            onSave={(newData) => handleUpdateLink(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <LinkWidget
            key={widget.id}
            widget={widget}
            data={data as LinkWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );
        
      case WidgetType.Agents:
        return is_editing ? (
          <AgentsEditor
            key={widget.id}
            data={data as AgentsWidgetData}
            onSave={(newData) => handleUpdateAgents(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <AgentsWidget
            key={widget.id}
            widget={widget}
            data={data as AgentsWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );
        
      case WidgetType.Gallery:
        return is_editing ? (
          <GalleryEditor
            key={widget.id}
            data={data as GalleryWidgetData}
            onSave={(newData) => handleUpdateGallery(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <GalleryWidget
            key={widget.id}
            widget={widget}
            data={data as GalleryWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );

      case WidgetType.YouTube:
        return is_editing ? (
          <YouTubeEditor
            key={widget.id}
            data={data as YouTubeWidgetData}
            onSave={(newData) => handleUpdateYouTube(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <YouTubeWidget
            key={widget.id}
            widget={widget}
            data={data as YouTubeWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );

      case WidgetType.Maps:
        return is_editing ? (
          <MapsEditor
            key={widget.id}
            data={data as MapsWidgetData}
            onSave={(newData) => handleUpdateMaps(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <MapsWidget
            key={widget.id}
            widget={widget}
            data={data as MapsWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );

      case WidgetType.Spotify:
        return is_editing ? (
          <SpotifyEditor
            key={widget.id}
            data={data as SpotifyWidgetData}
            onSave={(newData) => handleUpdateSpotify(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <SpotifyWidget
            key={widget.id}
            widget={widget}
            data={data as SpotifyWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );

      case WidgetType.Calendar:
        return is_editing ? (
          <CalendarEditor
            key={widget.id}
            data={data as CalendarWidgetData}
            onSave={(newData) => handleUpdateCalendar(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <CalendarWidget
            key={widget.id}
            widget={widget}
            data={data as CalendarWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );

      case WidgetType.Separator:
        return is_editing ? (
          <SeparatorEditor
            key={widget.id}
            data={data as SeparatorWidgetData}
            onSave={(newData) => handleUpdateSeparator(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <SeparatorWidget
            key={widget.id}
            widget={widget}
            data={data as SeparatorWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );

      case WidgetType.Title:
        return is_editing ? (
          <TitleEditor
            key={widget.id}
            data={data as TitleWidgetData}
            onSave={(newData) => handleUpdateTitle(widget.id, newData)}
            onCancel={handleCancelEdit}
          />
        ) : (
          <TitleWidget
            key={widget.id}
            widget={widget}
            data={data as TitleWidgetData}
            is_editing={false}
            onEdit={() => handleStartEdit(widget.id)}
            onDelete={() => handleDeleteWidget(widget.id, widget.type)}
          />
        );
        
      default:
        return null;
    }
  };

  // Create a map of widget data for the DnD provider
  const widgetsDataMap = new Map(
    widgetsWithData.map(({ widget, data }) => [widget.id, data])
  );

  return (
    <div className="space-y-4" id="links-section">
      {/* Error message */}
      {error && (
        <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <IconAlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700 dark:text-red-400">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Widget Selector Dialog */}
      <Dialog open={showWidgetSelector} onOpenChange={setShowWidgetSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seleccionar tipo de widget</DialogTitle>
            <DialogDescription>
              Elige el tipo de widget que deseas agregar a tu perfil.
            </DialogDescription>
          </DialogHeader>
          <WidgetSelector onSelect={handleWidgetTypeSelected} />
        </DialogContent>
      </Dialog>

      {/* New widget editors */}
      {isAddingNew && selectedWidgetType === WidgetType.Link && (
        <LinkEditor
          data={{
            title: '',
            url: '',
            description: '',
            icon: ''
          }}
          onSave={handleSaveNewLink}
          onCancel={handleCancelEdit}
        />
      )}
      
      {isAddingNew && selectedWidgetType === WidgetType.Agents && (
        <AgentsEditor
          data={{
            title: 'Chat con nuestros agentes',
            agent_ids: [],
            display_style: 'card'
          }}
          onSave={handleSaveNewAgents}
          onCancel={handleCancelEdit}
        />
      )}
      
      {isAddingNew && selectedWidgetType === WidgetType.Gallery && (
        <GalleryEditor
          data={{
            title: '',
            products: [],
            show_price: true,
            show_description: true,
            columns: 3
          }}
          onSave={handleSaveNewGallery}
          onCancel={handleCancelEdit}
        />
      )}

      {isAddingNew && selectedWidgetType === WidgetType.YouTube && (
        <YouTubeEditor
          data={{
            video_url: '',
            title: '',
            autoplay: false,
            show_controls: true
          }}
          onSave={handleSaveNewYouTube}
          onCancel={handleCancelEdit}
        />
      )}

      {isAddingNew && selectedWidgetType === WidgetType.Maps && (
        <MapsEditor
          data={{
            address: '',
            latitude: undefined,
            longitude: undefined,
            zoom_level: 15,
            map_style: 'roadmap'
          }}
          onSave={handleSaveNewMaps}
          onCancel={handleCancelEdit}
        />
      )}

      {isAddingNew && selectedWidgetType === WidgetType.Spotify && (
        <SpotifyEditor
          data={{
            spotify_url: '',
            embed_type: 'playlist',
            height: 380,
            theme: 'dark'
          }}
          onSave={handleSaveNewSpotify}
          onCancel={handleCancelEdit}
        />
      )}

      {isAddingNew && selectedWidgetType === WidgetType.Calendar && (
        <CalendarEditor
          data={{
            calendly_url: '',
            title: 'Agenda una reunión',
            hide_event_details: false,
            hide_cookie_banner: true
          }}
          onSave={handleSaveNewCalendar}
          onCancel={handleCancelEdit}
        />
      )}

      {isAddingNew && selectedWidgetType === WidgetType.Separator && (
        <SeparatorEditor
          data={{
            style: 'solid',
            thickness: 1,
            color: '#cccccc',
            margin_top: 20,
            margin_bottom: 20
          }}
          onSave={handleSaveNewSeparator}
          onCancel={handleCancelEdit}
        />
      )}

      {isAddingNew && selectedWidgetType === WidgetType.Title && (
        <TitleEditor
          data={{
            text: '',
            font_size: 'xl',
            text_align: 'center',
            font_weight: 'bold'
          }}
          onSave={handleSaveNewTitle}
          onCancel={handleCancelEdit}
        />
      )}

      {/* Widgets list with DnD */}
      {widgetsWithData.length > 0 ? (
        <WidgetDndProvider 
          widgets={activeWidgets}
          widgetsData={widgetsDataMap}
          onReorderWidgets={handleReorderWidgets}
        >
          <div className="space-y-4">
            {widgetsWithData.map(({ widget, data, type }) => 
              renderWidget(widget, data, type)
            )}
          </div>

          {/* Tips */}
          {!isAddingNew && !editingWidgetId && (
            <div className="text-center py-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                💡 Arrastra desde el ícono de grip para reordenar
              </p>
            </div>
          )}
        </WidgetDndProvider>
      ) : (
        /* Empty state */
        !isAddingNew && (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <IconPlus size={48} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold mb-2">No tienes widgets aún</h3>
            <p className="text-sm text-gray-500 mb-4">
              Usa el botón "Add Widget" en tu perfil para agregar enlaces, agentes, galerías y más.
            </p>
          </div>
        )
      )}
    </div>
  );
}