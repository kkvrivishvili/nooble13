import { createFileRoute, useParams } from '@tanstack/react-router'
import { ProfileProvider } from '@/context/profile-context'
import PublicProfile from '@/features/public-profile'

export const Route = createFileRoute('/$username')({
  component: RouteComponent,
})

function RouteComponent() {
  const { username } = useParams({ from: '/$username' })

  return (
    <ProfileProvider>
      <PublicProfile username={username} />
    </ProfileProvider>
  )
}

/*

/{username}
├── Header
│   ├── Avatar
│   ├── Nombre
│   └── Descripción
│
├── Social Links (iconos)
│
├── Tabs [Profile | Chats]
│
├── Tab Profile:
│   ├── Links Cards (estilo Linktree)
│   └── Chat Input (al final)
│
└── Tab Chats:
    ├── Agentes disponibles (cards)
    └── Chat Input

*/