"use client"

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// Create custom context for tabs state
interface TabsContextType {
  value?: string;
}

const TabsContext = React.createContext<TabsContextType>({})

function Tabs({
  className,
  value,
  defaultValue,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsContext.Provider value={{ value: value || defaultValue }}>
      <TabsPrimitive.Root
        data-slot='tabs'
        className={cn('flex flex-col gap-2', className)}
        value={value}
        defaultValue={defaultValue}
        {...props}
      />
    </TabsContext.Provider>
  )
}

function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const [hovering, setHovering] = React.useState(false)
  
  // Obtener el valor activo del contexto personalizado
  const { value: activeTab } = React.useContext(TabsContext)

  return (
    <TabsPrimitive.List
      data-slot='tabs-list'
      className={cn(
        'bg-transparent text-muted-foreground inline-flex h-10 items-center justify-center rounded-lg p-1 relative gap-1',
        className
      )}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement<React.ComponentProps<typeof TabsTrigger>>(child)) {
          return React.cloneElement(child, {
            ...(child.props as object),
            activeTab,
            hovering,
          } as React.ComponentProps<typeof TabsTrigger>)
        }
        return child
      })}
    </TabsPrimitive.List>
  )
}

interface TabsTriggerProps extends React.ComponentProps<typeof TabsPrimitive.Trigger> {
  'data-state'?: 'active' | 'inactive';
  activeTab?: string | null;
  hovering?: boolean;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, children, value, activeTab, hovering, asChild, ...props }, ref) => {
  const isActive = activeTab === value || (props as any)['data-state'] === 'active'
  
  return (
    <div className="relative">
      {isActive && (
        <motion.div
          layoutId="active-tab-indicator"
          transition={{ 
            type: "spring", 
            bounce: 0.25, 
            duration: 0.6 
          }}
          className="absolute inset-0 bg-[var(--tab-active-bg)] dark:bg-[var(--tab-active-bg)] rounded-md shadow-sm"
          style={{
            originY: "0px",
          }}
        />
      )}
      <TabsPrimitive.Trigger
        ref={ref}
        data-slot='tabs-trigger'
        value={value}
        asChild={asChild}
        className={cn(
          "relative inline-flex h-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-[color:var(--tab-active-text)] data-[state=inactive]:text-[color:var(--color-base-content)] z-10",
          className
        )}
        style={{
          transformStyle: "preserve-3d",
        }}
        {...props}
      >
        {children}
      </TabsPrimitive.Trigger>
    </div>
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

interface TabsContentProps extends React.ComponentProps<typeof TabsPrimitive.Content> {
  'data-state'?: 'active' | 'inactive';
}

function TabsContent({
  className,
  children,
  value,
  forceMount,
  ...props
}: TabsContentProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  
  React.useEffect(() => {
    // Small delay to ensure smooth transition
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 50)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <TabsPrimitive.Content
      data-slot='tabs-content'
      value={value}
      forceMount={forceMount}
      className={cn('flex-1 outline-none', className)}
      {...props}
    >
      <AnimatePresence mode="wait">
        {(forceMount || (props as any)['data-state'] === 'active') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
              opacity: isVisible ? 1 : 0, 
              y: isVisible ? 0 : 10 
            }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ 
              duration: 0.3,
              ease: "easeInOut"
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </TabsPrimitive.Content>
  )
}

// Versión alternativa con efecto de apilamiento 3D similar al ejemplo
interface StackedTabsContentProps {
  children: React.ReactNode[]
  activeIndex: number
  className?: string
  hovering?: boolean
}

export function StackedTabsContent({ 
  children, 
  activeIndex, 
  className,
  hovering = false 
}: StackedTabsContentProps) {
  return (
    <div className={cn("relative w-full", className)}>
      {React.Children.map(children, (child, idx) => {
        const offset = idx - activeIndex
        const isActive = idx === activeIndex
        
        return (
          <motion.div
            key={idx}
            style={{
              position: offset === 0 ? 'relative' : 'absolute',
              top: 0,
              left: 0,
              width: '100%',
            }}
            initial={false}
            animate={{
              scale: 1 - Math.abs(offset) * 0.05,
              y: hovering ? offset * 20 : offset * 10,
              opacity: Math.abs(offset) < 3 ? 1 - Math.abs(offset) * 0.2 : 0,
              zIndex: -Math.abs(offset),
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
          >
            {isActive && (
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
              >
                {child}
              </motion.div>
            )}
            {!isActive && child}
          </motion.div>
        )
      })}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }