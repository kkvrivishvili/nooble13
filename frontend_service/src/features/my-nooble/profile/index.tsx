// src/features/my-nooble/profile/index.tsx
import React, { useEffect } from 'react';
import { Profile as ProfileComponent } from './components/profile';
import { usePageContext } from '@/context/page-context';
import { LayoutWithMobile } from '@/components/layout/layout-with-mobile';
import { useProfile } from '@/hooks/use-profile';
import PublicProfile from '@/features/public-profile';

export function ProfilePage() {
  const { setTitle, setShareUrl } = usePageContext();
  const { profile } = useProfile();

  useEffect(() => {
    setTitle('My Profile');
    // Establecer la URL para compartir el perfil usando el username real
    if (profile?.username) {
      const shareUrl = `${window.location.origin}/${profile.username}`;
      setShareUrl(shareUrl);
    }

    // Limpiar la URL de compartir al desmontar el componente
    return () => {
      setShareUrl(undefined);
    };
  }, [setTitle, setShareUrl, profile?.username]);

  // Contenido de vista previa móvil - usando el username real del usuario
  const mobilePreviewContent = profile?.username ? (
    <PublicProfile username={profile.username} isPreview={true} />
  ) : (
    <div className="p-4 text-center text-gray-500">Cargando vista previa...</div>
  );

  return (
    <LayoutWithMobile previewContent={mobilePreviewContent}>
      <ProfileComponent />
    </LayoutWithMobile>
  );
}