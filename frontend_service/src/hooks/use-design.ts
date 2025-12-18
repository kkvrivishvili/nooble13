// src/hooks/use-design.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { designApi, DesignPresetName, DesignUpdate } from '@/api/design-api';
import { ProfileDesign } from '@/types/profile';
import { toast } from 'sonner';

export function useDesign() {
  const queryClient = useQueryClient();

  // Query for current design
  const {
    data: currentDesign,
    isLoading,
    error
  } = useQuery({
    queryKey: ['profile-design'],
    queryFn: () => designApi.getDesign(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Mutation for updating design
  const updateDesignMutation = useMutation({
    mutationFn: (design: DesignUpdate) => designApi.updateDesign(design),
    onMutate: async (newDesign) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['profile-design'] });

      // Snapshot the previous value
      const previousDesign = queryClient.getQueryData<ProfileDesign>(['profile-design']);

      // Optimistically update to the new value
      if (previousDesign) {
        queryClient.setQueryData<ProfileDesign>(['profile-design'], {
          ...previousDesign,
          ...newDesign,
          theme: {
            ...previousDesign.theme,
            ...(newDesign.theme || {})
          },
          layout: {
            ...previousDesign.layout,
            ...(newDesign.layout || {})
          }
        });
      }

      // Return a context object with the snapshotted value
      return { previousDesign };
    },
    onError: (_err, _newDesign, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousDesign) {
        queryClient.setQueryData(['profile-design'], context.previousDesign);
      }
      
      toast.error("No se pudo actualizar el diseño. Por favor intenta de nuevo.");
    },
    onSuccess: () => {
      toast.success("Los cambios se han guardado correctamente.");
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['profile-design'] });
      // Invalidate my profile context
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      // Invalidate all public-profile queries (e.g., Profile preview)
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });

  // Mutation for resetting to default
  const resetDesignMutation = useMutation({
    mutationFn: () => designApi.resetToDefault(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['profile-design'] });
    },
    onSuccess: () => {
      toast.success("Se ha restaurado el diseño predeterminado.");
    },
    onError: () => {
      toast.error("No se pudo restablecer el diseño. Por favor intenta de nuevo.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-design'] });
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });

  // Apply preset mutation
  const applyPresetMutation = useMutation({
    mutationFn: (presetName: DesignPresetName) => designApi.applyPreset(presetName),
    onSuccess: () => {
      toast.success("El preset se ha aplicado correctamente.");
    },
    onError: () => {
      toast.error("No se pudo aplicar el preset. Por favor intenta de nuevo.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-design'] });
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      queryClient.invalidateQueries({ queryKey: ['public-profile'] });
    },
  });

  return {
    currentDesign,
    isLoading,
    isError: !!error,
    isSaving: updateDesignMutation.isPending,
    isResetting: resetDesignMutation.isPending,
    updateDesign: updateDesignMutation.mutate,
    updateDesignAsync: updateDesignMutation.mutateAsync,
    resetToDefault: resetDesignMutation.mutate,
    resetToDefaultAsync: resetDesignMutation.mutateAsync,
    applyPreset: applyPresetMutation.mutate,
    applyPresetAsync: applyPresetMutation.mutateAsync,
    updateTheme: (theme: Partial<ProfileDesign['theme']>) => 
      currentDesign?.theme && updateDesignMutation.mutate({ 
        theme: {
          ...currentDesign.theme,
          ...theme,
        }
      }),
    updateLayout: (layout: Partial<ProfileDesign['layout']>) => 
      updateDesignMutation.mutate({ 
        layout: {
          ...(currentDesign?.layout || {}),
          ...layout,
        }
      }),
    updateWallpaper: (wallpaper: ProfileDesign['theme']['wallpaper']) => {
      if (!currentDesign?.theme) return;
      updateDesignMutation.mutate({ 
        theme: { 
          ...currentDesign.theme,
          wallpaper 
        } 
      });
    },
  };
}