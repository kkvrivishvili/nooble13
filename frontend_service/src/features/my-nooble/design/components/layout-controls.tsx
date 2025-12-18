import { ProfileLayout } from '@/types/profile';
import { StyleSelector } from './style-selector';
import { 
  IconLayoutNavbar,
  IconLayoutBottombar,
  IconEyeOff,
  IconSquare,
  IconRectangle,
  IconRectangleVertical,
} from '@tabler/icons-react';

type SocialPosition = 'top' | 'bottom' | 'hidden';
type ContentWidth = 'narrow' | 'normal' | 'wide';

interface LayoutControlsProps {
  layout: ProfileLayout;
  onChange: (updates: Partial<ProfileLayout>) => void;
}

export function LayoutControls({ layout, onChange }: LayoutControlsProps) {
  const socialPositionOptions = [
    { value: 'top', label: 'Arriba', icon: <IconLayoutNavbar size={24} /> },
    { value: 'bottom', label: 'Abajo', icon: <IconLayoutBottombar size={24} /> },
    { value: 'hidden', label: 'Oculto', icon: <IconEyeOff size={24} /> },
  ];

  const contentWidthOptions = [
    { value: 'narrow', label: 'Estrecho', icon: <IconRectangleVertical size={24} /> },
    { value: 'normal', label: 'Normal', icon: <IconRectangle size={24} /> },
    { value: 'wide', label: 'Ancho', icon: <IconSquare size={24} /> },
  ];

  return (
    <div className="space-y-6">
      <StyleSelector
        label="Posición de redes sociales"
        value={layout.social_position || 'top'}
        options={socialPositionOptions}
        onChange={(value) => onChange({ social_position: value as SocialPosition })}
        columns={3}
      />

      <StyleSelector
        label="Ancho del contenido"
        value={layout.content_width || 'normal'}
        options={contentWidthOptions}
        onChange={(value) => onChange({ content_width: value as ContentWidth })}
        columns={3}
      />
    </div>
  );
}