// src/components/layout/authenticated-layout.tsx
import Cookies from 'js-cookie'
import { Outlet } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { SearchProvider } from '@/context/search-context'
import { PageProvider } from '@/context/page-context'
import { ProfileProvider } from '@/context/profile-context'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'

import { PageTitle } from '@/components/layout/page-title'
import { PageSubNavigation } from '@/components/layout/page-sub-navigation'
import { PageIcons } from '@/components/layout/page-icons'
import SkipToMain from '@/components/skip-to-main'

interface Props {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: Props) {
  const defaultOpen = Cookies.get('sidebar_state') !== 'false'
  
  return (
    <SearchProvider>
      <PageProvider>
        <ProfileProvider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <SkipToMain />
            <AppSidebar />
            <div
              id='content'
              className={cn(
                'ml-auto w-full max-w-full',
                'w-[calc(100%-var(--sidebar-width))]',
                'transition-[width] duration-200 ease-linear',
                'flex h-svh flex-col'
              )}
            >
              <Header fixed>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-6">
                    <PageTitle />
                    <PageSubNavigation />
                  </div>
                  <PageIcons />
                </div>
              </Header>
              <Main>
                {children ? children : <Outlet />}
              </Main>
            </div>
          </SidebarProvider>
        </ProfileProvider>
      </PageProvider>
    </SearchProvider>
  )
}