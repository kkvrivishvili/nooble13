import React, { useState, type JSX } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string
    title: string
    icon: JSX.Element
  }[]
}

function cloneWithClass(element: JSX.Element, className: string) {
  return React.cloneElement(element, {
    className: `w-5 h-5 shrink-0 ${className}`,
    style: {
      color: 'var(--color-base-500)',
      ...element.props.style
    }
  });
}

export default function SidebarNav({
  className,
  items,
  ...props
}: SidebarNavProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [val, setVal] = useState(pathname ?? '/settings')

  const handleSelect = (e: string) => {
    setVal(e)
    navigate({ to: e })
  }

  return (
    <>
      {/* Mobile View */}
      <div className='p-1 md:hidden'>
        <Select value={val} onValueChange={handleSelect}>
          <SelectTrigger className='h-12 sm:w-48'>
            <SelectValue placeholder='Theme' />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href} className="py-2">
                <div className='flex items-center gap-3 px-2'>
                  {cloneWithClass(item.icon, '')}
                  <span className='text-md'>{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop View */}
      <ScrollArea
        orientation='horizontal'
        type='always'
        className='bg-background hidden w-full min-w-40 px-1 py-2 md:block'
      >
        <nav
          className={cn(
            'flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0',
            className
          )}
          {...props}
        >
          {items.map((item) => {
            const isActive = pathname === item.href;
            return (
              <div key={item.href} className='relative w-full'>
                {isActive && (
                  <div className='absolute inset-0 bg-accent dark:bg-accent rounded-md' />
                )}
                <Link
                  to={item.href}
                  className={cn(
                    buttonVariants({ variant: 'ghost' }),
                    'relative justify-start gap-2 group no-underline hover:no-underline w-full',
                    isActive 
                      ? 'text-accent-foreground font-medium' 
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {cloneWithClass(item.icon, isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')}
                  <span>{item.title}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </>
  )
}
