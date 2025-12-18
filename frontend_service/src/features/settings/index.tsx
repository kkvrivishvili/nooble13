import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  IconCheckbox,
  IconBellRingingFilled,
  IconPaletteFilled,
  IconSettingsFilled,
  IconUserFilled,
} from '@tabler/icons-react'
import { Main } from '@/components/layout/main'
import SidebarNav from './components/sidebar-nav'
import { usePageContext } from '@/context/page-context'

export default function Settings() {
  const { setTitle } = usePageContext()

  useEffect(() => {
    setTitle('Settings')
    return () => setTitle('')
  }, [setTitle])

  return (
    <>
      <Main>
        <div className='flex flex-1 flex-col space-y-2 overflow-hidden md:space-y-2 lg:flex-row lg:space-y-0 lg:space-x-8'>
          <aside className='top-0 border-r border-gray-200 dark:border-gray-700 lg:sticky lg:h-full lg:w-1/5 lg:pr-8'>
            <SidebarNav items={sidebarNavItems} />
          </aside>
          <div className='flex w-full overflow-y-hidden p-1'>
            <Outlet />
          </div>
        </div>
      </Main>
    </>
  )
}

const sidebarNavItems = [
  {
    title: 'Profile',
    icon: <IconUserFilled size={24} className="text-current" fill="currentColor" />,
    href: '/settings',
  },
  {
    title: 'Account',
    icon: <IconSettingsFilled size={24} className="text-current" fill="currentColor" />,
    href: '/settings/account',
  },
  {
    title: 'Appearance',
    icon: <IconPaletteFilled size={24} className="text-current" fill="currentColor" />,
    href: '/settings/appearance',
  },
  {
    title: 'Notifications',
    icon: <IconBellRingingFilled size={24} className="text-current" fill="currentColor" />,
    href: '/settings/notifications',
  },
  {
    title: 'Display',
    icon: <IconCheckbox size={24} className="text-current" fill="currentColor" />,
    href: '/settings/display',
  },
]