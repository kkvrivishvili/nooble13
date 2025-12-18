import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavGroup } from '@/components/layout/nav-group'
import { NavUser } from '@/components/layout/nav-user'
import { ThemeSwitch } from '@/components/theme-switch'
import { sidebarData } from './data/sidebar-data'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar 
      collapsible='none' // Cambiado de 'icon' a 'none' - sidebar siempre expandido
      variant='floating'
      className='fixed left-0 top-0 h-screen border-r border-gray-200 dark:border-gray-700 bg-[var(--sidebar-bg)] dark:bg-[var(--sidebar-bg-dark)] z-50'
      style={{
        '--sidebar-width': '16rem',
        zIndex: 50
      } as React.CSSProperties}
      {...props}
    >
      <SidebarHeader>
        <NavUser />
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter className="relative z-50">
        <div className="flex items-center justify-center p-2">
          <ThemeSwitch className="relative z-50" />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}