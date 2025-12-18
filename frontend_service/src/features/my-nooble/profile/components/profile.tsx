// src/features/my-nooble/profile/components/profile.tsx
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  IconPencil, 
  IconPlus, 
  IconAlertCircle
} from '@tabler/icons-react';
import { ProfileEditor } from './profile-editor';
import { SocialLinksEditor } from './social-links-editor';
import { WidgetManager } from './widgets/widget-manager';
import { useProfile } from '@/context/profile-context';
import { socialPlatformIcons } from '@/config/platform-config';

function ProfileHeader() {
  const { profile } = useProfile();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSocialLinksDialogOpen, setIsSocialLinksDialogOpen] = useState(false);

  if (!profile) {
    return null;
  }

  // Count active link widgets
  const activeLinkWidgets = profile.widgets.filter(w => w.type === 'link' && w.is_active).length;
  const totalActiveAgents = profile.agentDetails.filter(a => a.is_active).length;

  return (
    <>
      <div className="p-6">
        {/* Profile info */}
        <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Avatar className="h-24 w-24 border-2 border-gray-200 dark:border-gray-700">
              <AvatarImage src={profile.avatar} />
              <AvatarFallback className="text-2xl bg-gray-100 dark:bg-gray-700">
                {(profile.display_name || '')
                  .trim()
                  .split(' ')
                  .filter(Boolean)
                  .map((n: string) => n[0])
                  .join('') || 'NN'}
              </AvatarFallback>
            </Avatar>
          </div>
          
          {/* Info and actions */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {profile.display_name}
              </h1>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setIsEditDialogOpen(true)}
                className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Editar perfil"
              >
                <IconPencil size={16} />
              </Button>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
              {profile.description}
            </p>
            
            {/* Profile stats - Updated for new structure */}
            <div className="flex items-center justify-center md:justify-start gap-4 mb-4 text-sm text-gray-500 dark:text-gray-400">
              <span>{activeLinkWidgets} enlace{activeLinkWidgets !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{totalActiveAgents} agente{totalActiveAgents !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{(profile.social_links ?? []).length} red{(profile.social_links ?? []).length !== 1 ? 'es' : ''} social{(profile.social_links ?? []).length !== 1 ? 'es' : ''}</span>
              <span>•</span>
              <span>@{profile.username}</span>
            </div>
            
            {/* Social links */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              {(profile.social_links ?? []).map((link) => {
                const Icon = socialPlatformIcons[link.platform as keyof typeof socialPlatformIcons];
                if (!Icon) return null;
                
                return (
                  <a 
                    key={link.platform}
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
                    aria-label={`Ver perfil en ${link.platform}`}
                  >
                    <Icon size={20} strokeWidth={1.5} />
                  </a>
                );
              })}
              
              <Button 
                variant="ghost"
                onClick={() => setIsSocialLinksDialogOpen(true)}
                className="p-2 h-auto rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200"
                aria-label="Gestionar redes sociales"
              >
                 <IconPlus size={20} strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              className="flex-1 rounded-xl h-12 text-base font-medium"
              onClick={() => {
                // Scroll to widgets section and show widget selector dialog
                const linksSection = document.getElementById('links-section');
                if (linksSection) {
                  linksSection.scrollIntoView({ behavior: 'smooth' });
                  setTimeout(() => {
                    // Trigger widget selector dialog
                    const event = new CustomEvent('showWidgetSelector');
                    window.dispatchEvent(event);
                  }, 300);
                }
              }}
            >
              <IconPlus size={18} className="mr-2" />
              Add Widget
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
            <DialogDescription>
              Actualiza tu información personal y tu foto de perfil.
            </DialogDescription>
          </DialogHeader>
          <div>
            <ProfileEditor 
              onCancel={() => setIsEditDialogOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Social Links Dialog */}
      <Dialog open={isSocialLinksDialogOpen} onOpenChange={setIsSocialLinksDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar redes sociales</DialogTitle>
            <DialogDescription>
              Agrega o edita los enlaces a tus perfiles en redes sociales.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <SocialLinksEditor />
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setIsSocialLinksDialogOpen(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WidgetsSection() {
  return (
    <div id="links-section">
      <WidgetManager />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="animate-pulse">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-6 mb-6">
            <div className="h-24 w-24 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
            <div className="flex-1">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-3"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-4"></div>
              <div className="flex gap-2">
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: Error }) {
  const { refreshProfile } = useProfile();
  
  return (
    <div className="max-w-4xl mx-auto p-4">
      <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
        <IconAlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-700 dark:text-red-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium mb-1">Error al cargar el perfil</p>
              <p className="text-sm">{error.message}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshProfile()}
            >
              Reintentar
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function Profile() {
  const { profile, isLoading, isError } = useProfile();

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return <ErrorState error={new Error('Failed to load profile')} />;
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Alert>
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>
            No se pudo cargar el perfil. Por favor, intenta nuevamente.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <ProfileHeader />
      <WidgetsSection />
    </div>
  );
}