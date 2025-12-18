import { cn } from '@/lib/utils'

interface MobilePreviewProps {
  className?: string
  children: React.ReactNode
}

export function MobilePreview({ className, children }: MobilePreviewProps) {
  return (
    <div className={cn("relative mx-auto border-4 border-gray-800 rounded-4xl w-[280px] h-[622px] bg-white overflow-hidden shadow-xl", className)}>  
      {/* Fixed device height with full-height inner wrapper */}
      <div className="relative w-full h-full bg-white flex flex-col">
        {children}
      </div>
    </div>
  )
}
