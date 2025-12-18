import {
  IconHelp,
  IconChartCovariate,
  IconHeart,
  IconMessages,
} from '@tabler/icons-react'

import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  // NOTA: Los datos del usuario ahora se obtienen del contexto de autenticación (useAuth)
  // Esta estructura se mantiene para compatibilidad con el tipo SidebarData
  user: {
    name: '',
    email: '',
    avatar: '',
  },
  navGroups: [
    {
      title: '',
      items: [
        {
          title: 'My Nooble',
          icon: IconHeart,
          defaultOpen: true,
          items: [
            {
              title: 'Profile',
              url: '/my-nooble/profile',
            },
            {
              title: 'Agents',
              url: '/my-nooble/agents',
            },
            {
              title: 'Shop',
              url: '/my-nooble/shop',
            },
            {
              title: 'Design',
              url: '/my-nooble/design',
            },
          ],
        },
        {
          title: 'Insights',
          url: '/insights/overview',
          icon: IconChartCovariate,
        },
        {
          title: 'Conversations Flow',
          url: '/conversations',
          badge: '7',
          icon: IconMessages,
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          title: 'Help Center',
          url: '/help-center',
          icon: IconHelp,
        },
      ],
    },
  ],
}