import { Link } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/animated-tabs'
import { usePageContext } from '@/context/page-context'

export function PageSubNavigation() {
  const { subPages } = usePageContext()
  
  // Si no hay sub-páginas, no renderizar nada
  if (!subPages || subPages.length === 0) {
    return null
  }
  
  // Encontrar la página activa
  const activeSubPage = subPages.find(page => page.isActive)
  const activeValue = activeSubPage?.href || subPages[0]?.href
  
  return (
    <div className="w-full flex justify-between items-center gap-4">
      <div className="flex-1 overflow-x-auto">
        <Tabs value={activeValue} orientation="horizontal">
          <TabsList>
            {subPages.map((subPage) => (
              <TabsTrigger
                key={subPage.href}
                value={subPage.href}
                disabled={subPage.disabled}
                asChild
              >
                <Link 
                  to={subPage.href}
                  className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  {subPage.title}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}