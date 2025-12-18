import React from 'react'
import { cn } from '@/lib/utils'
import { MobilePreview } from './components/mobile-preview'
import { usePageContext } from '@/context/page-context'

interface LayoutWithMobileProps {
  children: React.ReactNode
  className?: string
  previewContent?: React.ReactNode
}

export function LayoutWithMobile({ 
  children, 
  className, 
  previewContent = (
    <div className="p-4">
      <div className="flex flex-col items-center text-center space-y-4 mb-6">
        <div className="h-20 w-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-2xl">
          👤
        </div>
        <div>
          <h3 className="font-medium">Tu Nombre</h3>
          <p className="text-xs text-gray-500">Una breve descripción sobre ti</p>
        </div>
      </div>
      
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-center">
            Enlace {i}
          </div>
        ))}
      </div>
    </div>
  ) 
}: LayoutWithMobileProps) {
  const { mobilePreview } = usePageContext()
  
  return (
    <div className={cn("flex", className)}>
      {/* Main content - removed overflow-y-auto to use parent scroll */}
      <div className={cn(
        "flex-1 p-6",
        mobilePreview && "border-r border-gray-200 dark:border-gray-800"
      )}>
        <div className={cn("mx-auto", mobilePreview ? "max-w-2xl" : "max-w-4xl")}>
          {children}
        </div>
      </div>

      {/* Mobile preview - conditionally rendered */}
      {mobilePreview && (
        <div className="hidden lg:block w-[350px] bg-gray-50 dark:bg-gray-900 p-4 lg:p-6">
          <div className="sticky top-6 w-full">
            <div className="flex justify-center">
              <MobilePreview>
                {previewContent}
              </MobilePreview>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}