// src/features/my-nooble/profile/components/profile-editor.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IconUpload, IconAlertCircle } from '@tabler/icons-react';
import { useProfile } from '@/context/profile-context';

interface ProfileEditorProps {
  onCancel: () => void;
}

export function ProfileEditor({ onCancel }: ProfileEditorProps) {
  const { profile, updateProfileInfo, updateProfile } = useProfile();
  const [formData, setFormData] = useState({
    display_name: '',
    description: '',
    avatar: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (profile) {
      const initialData = {
        display_name: profile.display_name ?? '',
        description: profile.description ?? '',
        avatar: profile.avatar ?? '',
      };
      setFormData(initialData);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) {
      const hasChanges = 
        (formData.display_name ?? '') !== (profile.display_name ?? '') ||
        (formData.description ?? '') !== (profile.description ?? '') ||
        (formData.avatar ?? '') !== (profile.avatar ?? '');
      setHasChanges(hasChanges);
    }
  }, [formData, profile]);

  if (!profile) return null;

  const validateForm = () => {
    if (!formData.display_name.trim()) {
      setError('El nombre es requerido');
      return false;
    }
    if (formData.display_name.length > 100) {
      setError('El nombre no puede tener más de 100 caracteres');
      return false;
    }
    if (formData.description.length > 200) {
      setError('La biografía no puede tener más de 200 caracteres');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setError('');

    try {
      // Update profile info immediately (optimistic update)
      updateProfileInfo(formData);
      
      // Persist to backend
      await updateProfile(formData);
      
      onCancel();
    } catch (error) {
      setError('Error al guardar los cambios. Por favor, intenta nuevamente.');
      void(error instanceof Error ? error : new Error('Error saving profile')); // Properly handle error without logging
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no puede ser mayor a 5MB');
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten archivos de imagen');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFormData(prev => ({
        ...prev,
        avatar: result
      }));
      setError('');
    };
    reader.onerror = () => {
      setError('Error al cargar la imagen');
    };
    reader.readAsDataURL(file);
  };

  const handleCancel = () => {
    if (hasChanges) {
      if (window.confirm('¿Estás seguro de que quieres cancelar? Los cambios no guardados se perderán.')) {
        onCancel();
      }
    } else {
      onCancel();
    }
  };

  return (
    <div className="space-y-6">
      {/* Error message */}
      {error && (
        <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <IconAlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700 dark:text-red-400">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Profile image section */}
      <div className="flex flex-col items-center space-y-4">
        <div className="relative group">
          <Avatar className="h-32 w-32 border-4 border-gray-200 dark:border-gray-700">
            <AvatarImage src={formData.avatar} />
            <AvatarFallback className="text-3xl bg-gray-100 dark:bg-gray-700">
              {(formData.display_name || '')
                .trim()
                .split(' ')
                .filter(Boolean)
                .map((n) => n[0])
                .join('')}
            </AvatarFallback>
          </Avatar>
          <label 
            htmlFor="avatar-upload"
            className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-3 rounded-full cursor-pointer hover:bg-primary/90 transition-colors shadow-lg border-2 border-white dark:border-gray-800"
          >
            <IconUpload size={18} />
            <input 
              id="avatar-upload" 
              type="file" 
              className="hidden" 
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isLoading}
            />
          </label>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Toca el icono para cambiar la foto de perfil
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Tamaño recomendado: 400x400 px • Máximo: 5MB
          </p>
        </div>
      </div>

      {/* Basic information section */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display_name" className="text-sm font-medium">
            Nombre para mostrar *
          </Label>
          <Input
            id="display_name"
            value={formData.display_name}
            onChange={(e) => {
              setFormData({...formData, display_name: e.target.value});
              setError('');
            }}
            className="h-11"
            placeholder="Tu nombre completo"
            disabled={isLoading}
            maxLength={100}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Este nombre aparecerá en tu perfil público</span>
            <span>{(formData.display_name?.length ?? 0)}/100</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-sm font-medium">
            Biografía
          </Label>
          <div className="relative">
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => {
                setFormData({...formData, description: e.target.value});
                setError('');
              }}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Cuéntale a la gente quién eres, qué haces o qué te apasiona..."
              maxLength={200}
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background px-1 rounded">
              {(formData.description?.length ?? 0)}/200
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Una buena biografía ayuda a que las personas te conozcan mejor
          </p>
        </div>
      </div>

      {/* Username info */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              Nombre de usuario
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              @{profile.username}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled>
            Cambiar próximamente
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Tu URL será: {window.location.origin}/{profile.username}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button 
          type="button"
          variant="outline" 
          className="flex-1 h-11 text-base font-medium"
          onClick={handleCancel}
          disabled={isLoading}
        >
          Cancelar
        </Button>
        <Button 
          type="button"
          className="flex-1 h-11 text-base font-medium"
          onClick={handleSave}
          disabled={isLoading || !hasChanges}
        >
          {isLoading ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Save indicator */}
      {hasChanges && !isLoading && (
        <p className="text-xs text-orange-600 dark:text-orange-400 text-center">
          Tienes cambios sin guardar
        </p>
      )}
    </div>
  );
}