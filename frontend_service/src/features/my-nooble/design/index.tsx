// src/features/my-nooble/design/index.tsx - UPDATED to use only design-api.ts
import { useState, useEffect, useMemo, useRef } from 'react';
import { useProfile } from '@/context/profile-context';
import { designPresets, DesignPresetName } from '@/api/design-api';
import { ProfileDesign, ProfileWallpaper, ProfileLayout } from '@/types/profile';

import { cn } from '@/lib/utils';

import { useDesign } from '@/hooks/use-design';
import { LayoutWithMobile } from '@/components/layout/layout-with-mobile';
import PublicProfile from '@/features/public-profile';
import { ProfileThemeProvider } from '@/context/profile-theme-context';

// Import updated components
import { PresetGrid } from './components/preset-grid';
import { ColorPicker } from './components/color-picker';
import { WallpaperConfig } from './components/wallpaper-config';
import { StyleSelector } from './components/style-selector';
import { LayoutControls } from './components/layout-controls';
import {
  IconSquare,
  IconCircle,
  IconSquareRoundedFilled,
  IconShadow,
} from '@tabler/icons-react';
import { Label } from '@/components/ui/label';

export default function DesignPage() {
  const { profile } = useProfile();
  const {
    currentDesign,
    isLoading,
    updateDesignAsync,
    applyPresetAsync,
  } = useDesign();

  const [localDesign, setLocalDesign] = useState<ProfileDesign | null>(null);
  const [activeTab, setActiveTab] = useState('buttons');
  const [hasChanges, setHasChanges] = useState(false);
  const latestDesignRef = useRef<ProfileDesign | null>(null);

  useEffect(() => {
    latestDesignRef.current = localDesign;
  }, [localDesign]);

  useEffect(() => {
    if (currentDesign) {
      setLocalDesign(currentDesign);
    }
  }, [currentDesign]);

  const handlePresetSelect = async (presetName: DesignPresetName) => {
    try {
      const preset = designPresets[presetName];
      setLocalDesign(preset);
      setHasChanges(true);
      // Apply preset via hook (handles invalidations and toasts)
      await applyPresetAsync(presetName);
      // Clear changes only if the latest local design still matches the preset
      if (JSON.stringify(latestDesignRef.current) === JSON.stringify(preset)) {
        setHasChanges(false);
      }
    } catch (_error) {
      // hook already shows toast; keep silent here
    }
  };

  const updateTheme = (updates: Partial<ProfileDesign['theme']>) => {
    setLocalDesign((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        theme: { ...prev.theme, ...updates },
      };
    });
    setHasChanges(true);
  };

  const updateWallpaper = (wallpaper: ProfileWallpaper) => {
    setLocalDesign((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        theme: { ...prev.theme, wallpaper },
      };
    });
    setHasChanges(true);
  };

  const updateLayout = (updates: Partial<ProfileDesign['layout']>) => {
    setLocalDesign((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        layout: { ...prev.layout, ...updates },
      };
    });
    setHasChanges(true);
  };

  // Auto-save 3 seconds after the last change (debounced)
  useEffect(() => {
    if (!localDesign || !hasChanges) return;

    let canceled = false;
    const timeout = setTimeout(async () => {
      if (canceled) return;
      try {
        await updateDesignAsync(localDesign);
        if (canceled) return;
        setHasChanges(false); // Mark as saved
      } catch (_error) {
        // hook already shows toast; keep silent here
      }
    }, 3000);

    // Cleanup function
    return () => {
      canceled = true;
      clearTimeout(timeout);
    };
  }, [localDesign, hasChanges, updateDesignAsync]);



  // Mobile preview content
  const mobilePreviewContent = useMemo(() => {
    if (!profile?.username || !localDesign) return null;
    
    return (
      <div className="h-full overflow-y-auto">
        <ProfileThemeProvider profileDesign={localDesign}>
          <PublicProfile 
            username={profile.username} 
            isPreview={true} 
            previewDesign={localDesign}
            useExternalTheme={true}
          />
        </ProfileThemeProvider>
      </div>
    );
  }, [profile?.username, localDesign]);



  if (isLoading || !localDesign) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Cargando diseño...</p>
        </div>
      </div>
    );
  }

  const designContent = (
    <div className="space-y-8">


      {/* 1. Presets Grid - Primera posición */}
      <PresetGrid 
        currentDesign={localDesign}
        onSelectPreset={handlePresetSelect}
      />

      {/* 2. Wallpaper Config - Segunda posición */}
      <WallpaperConfig
        wallpaper={localDesign.theme.wallpaper}
        onChange={updateWallpaper}
        theme={localDesign.theme}
      />

      {/* 3. Design Tabs - Tercera posición (Botones, Tipografías, Distribución) */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Personalización</h3>
        
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'buttons', label: 'Estilos de botones' },
              { id: 'typography', label: 'Tipografías' },
              { id: 'layout', label: 'Distribución' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "py-2 px-1 border-b-2 font-medium text-sm transition-colors",
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="py-4">
          {activeTab === 'buttons' && (
            <div className="space-y-6">
              <StyleSelector
                label="Relleno"
                value={localDesign.theme.button_fill || 'solid'}
                options={[
                  { value: 'solid', label: 'Sólido', icon: <IconSquare size={24} fill="currentColor" /> },
                  { value: 'glass', label: 'Cristal', icon: <IconSquare size={24} className="opacity-50" /> },
                  { value: 'outline', label: 'Contorno', icon: <IconSquare size={24} /> },
                ]}
                onChange={(value) => updateTheme({ button_fill: value as ProfileDesign['theme']['button_fill'] })}
                columns={3}
              />
              
              <StyleSelector
                label="Bordes"
                value={localDesign.theme.border_radius || 'curved'}
                options={[
                  { value: 'sharp', label: 'Recto', icon: <IconSquare size={24} /> },
                  { value: 'curved', label: 'Curvo', icon: <IconSquareRoundedFilled size={24} /> },
                  { value: 'round', label: 'Redondo', icon: <IconCircle size={24} /> },
                ]}
                onChange={(value) => updateTheme({ border_radius: value as ProfileDesign['theme']['border_radius'] })}
                columns={3}
              />
              
              <StyleSelector
                label="Sombra"
                value={localDesign.theme.button_shadow || 'subtle'}
                options={[
                  { value: 'none', label: 'Sin sombra', icon: <IconShadow size={24} className="opacity-30" /> },
                  { value: 'subtle', label: 'Sutil', icon: <IconShadow size={24} className="opacity-60" /> },
                  { value: 'hard', label: 'Dura', icon: <IconShadow size={24} /> },
                ]}
                onChange={(value) => updateTheme({ button_shadow: value as ProfileDesign['theme']['button_shadow'] })}
                columns={3}
              />
            </div>
          )}

          {activeTab === 'typography' && (
            <div className="space-y-6">
              <StyleSelector
                label="Fuente"
                value={localDesign.theme.font_family || 'sans'}
                options={[
                  { 
                    value: 'sans', 
                    label: 'Sans',
                    preview: <span style={{ fontFamily: 'sans-serif' }}>Aa Bb Cc</span>
                  },
                  { 
                    value: 'serif', 
                    label: 'Serif',
                    preview: <span style={{ fontFamily: 'serif' }}>Aa Bb Cc</span>
                  },
                  { 
                    value: 'mono', 
                    label: 'Mono',
                    preview: <span style={{ fontFamily: 'monospace' }}>Aa Bb Cc</span>
                  },
                ]}
                onChange={(value) => updateTheme({ font_family: value as ProfileDesign['theme']['font_family'] })}
                columns={3}
              />
            </div>
          )}

          {activeTab === 'layout' && (
            <LayoutControls
              layout={(localDesign.layout ?? {}) as ProfileLayout}
              onChange={updateLayout}
            />
          )}
        </div>
      </div>

      {/* 4. Color Picker - Al final */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Colores</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Color primario</Label>
            <ColorPicker
              value={localDesign.theme.primary_color}
              onChange={(color) => updateTheme({ primary_color: color })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Color de texto</Label>
            <ColorPicker
              value={localDesign.theme.text_color || '#111827'}
              onChange={(color) => updateTheme({ text_color: color })}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Color de texto en botones</Label>
            <ColorPicker
              value={localDesign.theme.button_text_color || '#ffffff'}
              onChange={(color) => updateTheme({ button_text_color: color })}
            />
          </div>
        </div>
      </div>

      {/* Help text */}
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
        💡 <strong>Tip:</strong> Los cambios se guardan automáticamente cada 3 segundos.
      </div>
    </div>
  );

  return (
    <LayoutWithMobile previewContent={mobilePreviewContent}>
      {designContent}
    </LayoutWithMobile>
  );
}