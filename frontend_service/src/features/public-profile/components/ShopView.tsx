import { cn } from '@/lib/utils'
import { useProfileTheme } from '@/context/profile-theme-context'
import { ProfileWithAgents } from '@/types/profile'

interface ShopViewProps {
  profile: ProfileWithAgents
}

export default function ShopView({ profile }: ShopViewProps) {
  const { theme, layout } = useProfileTheme()

  // Mock products
  const products = [
    { id: 'p1', title: 'Producto A', price: 19.99, description: 'Descripción corta del producto A' },
    { id: 'p2', title: 'Producto B', price: 29.99, description: 'Descripción corta del producto B' },
    { id: 'p3', title: 'Producto C', price: 9.99, description: 'Descripción corta del producto C' },
  ]

  const cardStyle: React.CSSProperties = {
    borderRadius: theme.border_radius === 'sharp' ? '0.5rem' : theme.border_radius === 'curved' ? '0.75rem' : '1rem',
    border: `1px solid ${theme.primary_color || '#e5e7eb'}`,
    backgroundColor: theme.background_color || '#fff',
  }

  return (
    <div
      className={cn(
        'w-full mx-auto px-4 pb-8',
        layout.content_width === 'narrow' && 'max-w-md',
        layout.content_width === 'normal' && 'max-w-xl',
        layout.content_width === 'wide' && 'max-w-3xl'
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {products.map(p => (
          <div key={p.id} className="p-4 shadow-sm" style={cardStyle}>
            <h3 className="font-semibold text-base" style={{ color: theme.text_color || theme.primary_color }}>{p.title}</h3>
            <p className="text-sm mt-1" style={{ color: theme.text_color || '#374151', opacity: 0.8 }}>{p.description}</p>
            <div className="mt-3 font-bold">${p.price.toFixed(2)}</div>
            <button
              className="mt-3 text-sm px-3 py-2 rounded-md border transition-colors"
              style={{
                backgroundColor: theme.primary_color,
                color: theme.button_text_color || '#fff',
                borderColor: theme.primary_color,
              }}
              onClick={() => alert('Mock: Añadido al carrito')}
            >
              Añadir al carrito
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
