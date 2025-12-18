import React from 'react'
import { cn } from '@/lib/utils'
// import { Separator } from '@/components/ui/separator'
// import { SidebarTrigger } from '@/components/ui/sidebar'

interface HeaderProps extends React.HTMLAttributes<HTMLElement> {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

export const Header = ({
  className,
  fixed,
  children,
  ...props
}: HeaderProps) => {
  const [offset, setOffset] = React.useState(0)

  React.useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    // Add scroll listener to the body
    document.addEventListener('scroll', onScroll, { passive: true })

    // Clean up the event listener on unmount
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'bg-background flex min-h-16 items-center gap-3 px-4 py-2 sm:gap-4 border-b border-gray-200 dark:border-gray-700',
        fixed && 'header-fixed peer/header fixed z-50 w-[inherit]',
        offset > 10 && fixed ? 'shadow-sm' : 'shadow-none',
        className
      )}
      {...props}
    >
      {/* SIDEBAR TRIGGER DESACTIVADO - Se mantiene comentado para referencia futura
      <SidebarTrigger variant='outline' className='scale-125 sm:scale-100' />
      <Separator orientation='vertical' className='h-6' />
      
      Nota: El botón de colapso del sidebar está desactivado.
      La funcionalidad de colapso está disponible pero no se está utilizando.
      Para reactivar: descomentar estas líneas y cambiar collapsible='icon' en AppSidebar
      */}
      {children}
    </header>
  )
}

Header.displayName = 'Header'