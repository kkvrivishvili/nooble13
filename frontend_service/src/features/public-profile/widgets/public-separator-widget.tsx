// src/features/public-profile/widgets/public-separator-widget.tsx
import { PublicWidgetProps } from './types';

interface PublicSeparatorWidgetProps extends PublicWidgetProps {
  data: {
    style: 'solid' | 'dashed' | 'dotted';
    thickness: number;
    color: string;
    margin_top: number;
    margin_bottom: number;
  };
}

export function PublicSeparatorWidget({ data, theme, className }: PublicSeparatorWidgetProps) {
  // Use theme primary color if color is default gray
  const separatorColor = data.color === '#cccccc' && theme?.primary_color 
    ? `${theme.primary_color}30` // 30% opacity of primary color
    : data.color;

  return (
    <div 
      className={className}
      style={{
        marginTop: `${data.margin_top}px`,
        marginBottom: `${data.margin_bottom}px`,
      }}
    >
      <hr
        style={{
          border: 'none',
          borderTop: `${data.thickness}px ${data.style} ${separatorColor}`,
          margin: 0,
          opacity: theme?.wallpaper?.type === 'pattern' ? 0.5 : 1, // Reduce opacity on patterned backgrounds
        }}
      />
    </div>
  );
}