import { Link } from '@tanstack/react-router'
import { IconSettings, IconBell, IconShare3 } from '@tabler/icons-react'
import { usePageContext } from '@/context/page-context'

export function PageIcons() {
  const { shareUrl } = usePageContext()

  const handleShareClick = async () => {
    if (!shareUrl) return
    
    try {
      await navigator.clipboard.writeText(shareUrl)
      alert('¡Enlace copiado al portapapeles!')
    } catch {
      alert('No se pudo copiar el enlace. Por favor, inténtalo de nuevo.')
    }
  }

  return (
    <div className="flex items-center space-x-2">
      {shareUrl && (
        <button
          onClick={handleShareClick}
          className="flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-[var(--color-base-200)] bg-white hover:bg-[var(--color-base-100)] transition-colors"
          aria-label="Compartir perfil"
          title="Copiar enlace del perfil"
        >
          <IconShare3 className="h-5 w-5 [stroke-width:1.5]" />
          <span className="text-sm font-medium">Share</span>
        </button>
      )}    
      <Link 
        to="/settings" 
        className="flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--color-base-200)] bg-white hover:bg-[var(--color-base-100)] transition-colors"
        aria-label="Notificaciones"
        title="Notificaciones"
      >
        <IconBell className="h-5 w-5 [stroke-width:1.5]" />
      </Link>
      <Link 
        to="/settings" 
        className="flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--color-base-200)] bg-white hover:bg-[var(--color-accent)] transition-colors"
        aria-label="Configuración"
        title="Configuración"
      >
        <IconSettings className="h-5 w-5 [stroke-width:1.5]" />
      </Link>
      
    </div>
  )
}
