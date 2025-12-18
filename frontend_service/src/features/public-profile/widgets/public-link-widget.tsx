// src/features/public-profile/widgets/public-link-widget.tsx - Refactored to use BaseWidget utilities
import { IconExternalLink } from '@tabler/icons-react';
import { PublicWidgetProps, PublicLinkWidgetData } from './types';
import BaseWidget from './BaseWidget';
import { cn } from '@/lib/utils';

interface PublicLinkWidgetProps extends PublicWidgetProps {
  data: PublicLinkWidgetData;
}

export function PublicLinkWidget({ data, theme, className }: PublicLinkWidgetProps) {
  const handleClick = () => {
    window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <BaseWidget.Button
      theme={theme}
      className={cn("w-full p-4 flex items-center justify-between group", className)}
      onClick={handleClick}
      variant="primary"
    >
      <div className="flex-1 text-left">
        <BaseWidget.Text theme={theme} as="h3" className="font-medium mb-1" inheritColor={true}>
          {data.title}
        </BaseWidget.Text>
        {data.description && (
          <BaseWidget.Text theme={theme} variant="muted" as="p" className="text-sm" inheritColor={true}>
            {data.description}
          </BaseWidget.Text>
        )}
      </div>
      <div className="ml-3 flex-shrink-0 transition-transform group-hover:translate-x-1">
        <IconExternalLink size={18} />
      </div>
    </BaseWidget.Button>
  );
}