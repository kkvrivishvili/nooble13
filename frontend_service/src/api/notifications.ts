// TEMPORAL: Stub para API de notificaciones
// Este archivo es un placeholder hasta que se implemente el sistema completo de notificaciones

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Tipos temporales para notificaciones
export interface NotificationSettings {
  type: 'all' | 'mentions' | 'none'
  mobile?: boolean
  communication_emails?: boolean
  social_emails?: boolean
  marketing_emails?: boolean
  security_emails?: boolean
}

// Hook temporal para obtener configuración de notificaciones
export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: async (): Promise<NotificationSettings> => {
      // Datos por defecto temporales
      return {
        type: 'all',
        mobile: true,
        communication_emails: true,
        social_emails: false,
        marketing_emails: false,
        security_emails: true,
      }
    },
    // Simular carga
    staleTime: 1000 * 60 * 5, // 5 minutos
  })
}

// Hook temporal para actualizar configuración de notificaciones
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: NotificationSettings): Promise<NotificationSettings> => {
      // Simular llamada a API
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // TODO: Implementar llamada real a la API cuando esté lista
      console.log('Configuración de notificaciones actualizada (temporal):', settings)
      
      return settings
    },
    onSuccess: (data) => {
      // Actualizar cache
      queryClient.setQueryData(['notification-settings'], data)
    },
  })
}

// Función temporal para obtener configuración
export async function getNotificationSettings(): Promise<NotificationSettings> {
  // TODO: Implementar llamada real a la API
  return {
    type: 'all',
    mobile: true,
    communication_emails: true,
    social_emails: false,
    marketing_emails: false,
    security_emails: true,
  }
}

// Función temporal para actualizar configuración
export async function updateNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings> {
  // TODO: Implementar llamada real a la API
  console.log('Actualizando configuración de notificaciones:', settings)
  return settings
}
