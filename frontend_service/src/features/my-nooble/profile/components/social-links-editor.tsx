// src/features/my-nooble/profile/components/social-links-editor.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconX, IconPlus, IconExternalLink, IconAlertCircle } from '@tabler/icons-react';
import { getAvailableSocialPlatforms, getSocialPlatformConfig } from '@/config/platform-config';
import { useProfile } from '@/context/profile-context';
import type { SocialLink } from '@/types/profile';

// Función para extraer el nombre de usuario de una URL completa
function extractUsername(platform: string, url: string): string {
  const platformConfig = getSocialPlatformConfig(platform);
  if (!platformConfig || !url) return '';
  
  try {
    // Intentar extraer el nombre de usuario de una URL completa
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[pathParts.length - 1];
    }
    return '';
  } catch (_e) {
    // Si no es una URL válida, asumimos que es solo el nombre de usuario
    return url;
  }
}

// Función para construir la URL completa desde un nombre de usuario
function buildSocialUrl(platform: string, username: string): string {
  const platformConfig = getSocialPlatformConfig(platform);
  if (!platformConfig || !username) return '';
  
  // Eliminar caracteres especiales o espacios al principio y final
  const cleanUsername = username.trim().replace(/^[@/]+/, '');
  
  // Construir URL basada en la plataforma
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${cleanUsername}`;
    case 'twitter':
      return `https://twitter.com/${cleanUsername}`;
    case 'facebook':
      return `https://www.facebook.com/${cleanUsername}`;
    case 'linkedin':
      return `https://www.linkedin.com/in/${cleanUsername}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${cleanUsername}`;
    case 'youtube':
      return `https://www.youtube.com/@${cleanUsername}`;
    case 'spotify':
      return `https://open.spotify.com/user/${cleanUsername}`;
    default:
      return '';
  }
}

interface SocialLinkItemProps {
  socialLink: SocialLink;
  isNew?: boolean;
  onCancel?: () => void;
}

function SocialLinkItem({ socialLink, isNew = false, onCancel }: SocialLinkItemProps) {
  const { updateSocialLink, removeSocialLink } = useProfile();
  const [isEditing, setIsEditing] = useState(isNew);
  const [username, setUsername] = useState(extractUsername(socialLink.platform, socialLink.url));
  const [_error, _setError] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  const config = getSocialPlatformConfig(socialLink.platform);
  
  const { register, handleSubmit, formState: { errors } } = useForm<{ username: string }>({
    defaultValues: {
      username: username
    }
  });

  const handleSave = async (data: { username: string }) => {
    if (!data.username) {
      _setError('El nombre de usuario es requerido');
      return;
    }
    
    setIsUpdating(true);
    try {
      const fullUrl = buildSocialUrl(socialLink.platform, data.username);
      await updateSocialLink(socialLink.platform, { url: fullUrl });
      setIsEditing(false);
      setUsername(data.username);
      _setError('');
    } catch (_e) {
      _setError('Error al actualizar el enlace');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    _setError('');
    onCancel?.(); // Llamar a onCancel si está definido
  };

  const handleRemove = async () => {
    setIsUpdating(true);
    try {
      await removeSocialLink(socialLink.platform);
    } catch (_e) {
      _setError('Error al eliminar el enlace');
      setIsUpdating(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {isEditing ? (
        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              {socialLink.platform === 'instagram' && 'www.instagram.com/'}
              {socialLink.platform === 'twitter' && 'twitter.com/'}
              {socialLink.platform === 'tiktok' && 'www.tiktok.com/@'}
              {socialLink.platform === 'youtube' && 'www.youtube.com/@'}
              {socialLink.platform === 'linkedin' && 'www.linkedin.com/in/'}
              {socialLink.platform === 'facebook' && 'www.facebook.com/'}
              {socialLink.platform === 'spotify' && 'open.spotify.com/user/'}
            </div>
            <Input
              type="text"
              placeholder="nombreusuario"
              {...register('username')}
              className={errors.username ? 'border-red-300' : ''}
              disabled={isUpdating}
            />
          </div>
          {errors.username && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <IconAlertCircle size={12} />
              {errors.username.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit(handleSave)}
              disabled={isUpdating}
              className="flex-1"
            >
              Guardar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isUpdating}
              className="flex-1"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Platform icon */}
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex-shrink-0">
              {typeof (config?.icon) === 'string' ? (
                <span className="text-xl">{config?.icon}</span>
              ) : React.isValidElement(config?.icon) ? (
                config?.icon
              ) : config?.icon ? (
                React.createElement(config.icon, { size: 24, className: "text-gray-700 dark:text-gray-300" })
              ) : typeof socialLink.icon === 'string' ? (
                <span className="text-xl">{socialLink.icon}</span>
              ) : socialLink.icon ? (
                React.createElement(socialLink.icon, { size: 24, className: "text-gray-700 dark:text-gray-300" })
              ) : null}
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Platform label */}
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">
                  {config?.label || socialLink.platform}
                </h4>
                <div className="flex items-center gap-1">
                  {socialLink.url && !isEditing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(socialLink.url, '_blank')}
                      disabled={isUpdating}
                    >
                      <IconExternalLink size={14} />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    onClick={handleRemove}
                    disabled={isUpdating}
                  >
                    <IconX size={14} />
                  </Button>
                </div>
              </div>
              
              {/* URL input */}
              <div 
                className="cursor-pointer group"
                onClick={() => setIsEditing(true)}
              >
                {socialLink.url ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate group-hover:text-gray-900 dark:group-hover:text-gray-200">
                    {username ? `@${username}` : socialLink.url}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic">
                    Toca para agregar usuario
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Toca para editar
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSocialLinkForm({ onCancel, availablePlatforms }: { 
  onCancel: () => void; 
  availablePlatforms: Array<{platform: SocialLink['platform'], label: string}>
}) {
  const { addSocialLink } = useProfile();
  const [isSaving, setIsSaving] = useState(false);
  const [_error, _setError] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<SocialLink['platform'] | ''>('');
  const [username, setUsername] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPlatform) {
      _setError('Debes seleccionar una plataforma');
      return;
    }
    
    if (!username) {
      _setError('El nombre de usuario es requerido');
      return;
    }

    setIsSaving(true);
    try {
      const fullUrl = buildSocialUrl(selectedPlatform, username);
      
      await addSocialLink({
        platform: selectedPlatform,
        url: fullUrl
      });
      
      onCancel();
    } catch (error) {
      _setError(error instanceof Error ? error.message : 'Error al añadir enlace social');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700 space-y-4">
      <h4 className="font-medium text-lg">Agregar nueva red social</h4>
      <div>
        <Select onValueChange={(value: SocialLink['platform']) => setSelectedPlatform(value)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una plataforma" />
          </SelectTrigger>
          <SelectContent>
            {availablePlatforms.map(p => (
              <SelectItem key={p.platform} value={p.platform}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!selectedPlatform && _error && <p className="text-xs text-red-500 mt-1">Debes seleccionar una plataforma</p>}
      </div>
      <div>
        {selectedPlatform && (
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 text-sm text-gray-500">
              {selectedPlatform === 'instagram' && 'www.instagram.com/'}
              {selectedPlatform === 'twitter' && 'twitter.com/'}
              {selectedPlatform === 'tiktok' && 'www.tiktok.com/@'}
              {selectedPlatform === 'youtube' && 'www.youtube.com/@'}
              {selectedPlatform === 'linkedin' && 'www.linkedin.com/in/'}
              {selectedPlatform === 'facebook' && 'www.facebook.com/'}
              {selectedPlatform === 'spotify' && 'open.spotify.com/user/'}
            </div>
            <Input 
              placeholder="nombreusuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        )}
        {!username && _error && <p className="text-xs text-red-500 mt-1">El nombre de usuario es requerido</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!selectedPlatform || !username || isSaving} className="flex-1">
          {isSaving ? 'Guardando...' : 'Guardar Enlace'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
      </div>
      {_error && <p className="text-xs text-red-500 mt-1">{_error}</p>}
    </form>
  )
}

export function SocialLinksEditor() {
  const { profile } = useProfile();
  const [isAdding, setIsAdding] = useState(false);
  const [_error, _setError] = useState<string>('');

  const socialLinks = profile?.social_links || [];

  const availablePlatforms = getAvailableSocialPlatforms(
    socialLinks.map(link => link.platform)
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {socialLinks.length > 0 ? (
          socialLinks.map((link: SocialLink) => (
            <SocialLinkItem key={link.platform} socialLink={link} />
          ))
        ) : (
          !isAdding && (
            <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No hay redes sociales</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Agrega tus perfiles para que la gente pueda encontrarte.</p>
            </div>
          )
        )}
      </div>

      {isAdding ? (
        <AddSocialLinkForm 
          onCancel={() => setIsAdding(false)} 
          availablePlatforms={availablePlatforms} 
        />
      ) : (
        <Button variant="outline" onClick={() => setIsAdding(true)} className="w-full">
          <IconPlus className="mr-2 h-4 w-4" />
          Agregar Red Social
        </Button>
      )}
    </div>
  );
}