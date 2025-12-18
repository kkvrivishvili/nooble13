// src/features/my-nooble/profile/components/widgets/youtube/youtube-widget.tsx
import { IconBrandYoutube } from '@tabler/icons-react';
import { SortableWidget } from '../common/sortable-widget';
import { WidgetActions } from '../common/widget-actions';
import { YouTubeWidgetData, WidgetComponentProps } from '@/types/widget';

export function YouTubeWidget({
  widget,
  data,
  is_editing,
  onEdit,
  onDelete,
}: WidgetComponentProps<YouTubeWidgetData>) {
  // Extract video ID from URL
  const getVideoId = (url: string) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?]*)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const videoId = getVideoId(data.video_url);

  return (
    <SortableWidget widget={widget} isDraggingDisabled={is_editing}>
      <div className="widget-header">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Icon */}
          <div className="widget-icon">
            <IconBrandYoutube size={16} className="text-gray-700 dark:text-gray-300" />
          </div>
          
          {/* Title */}
          <h3 className="widget-title">
            {data.title || 'Video de YouTube'}
          </h3>
        </div>
        
        {/* Actions */}
        <WidgetActions
          onEdit={onEdit}
          onDelete={onDelete}
          disabled={is_editing}
          className="flex items-center gap-1"
        />
      </div>
      
      {/* YouTube embed */}
      {videoId ? (
        <div className="p-4 pt-3">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              src={`https://www.youtube.com/embed/${videoId}?${data.autoplay ? 'autoplay=1' : ''}${!data.show_controls ? '&controls=0' : ''}`}
              title={data.title || 'YouTube video'}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="p-4 pt-3 text-center text-sm text-gray-500 dark:text-gray-400">
          URL de video inválida
        </div>
      )}
    </SortableWidget>
  );
}