// src/features/public-profile/widgets/BaseWidget.tsx - Consolidated base component for widgets
import React, { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ProfileTheme } from '@/types/profile'
import { 
  getButtonStyles, 
  getButtonHoverStyles, 
  getBorderRadius, 
  getShadowStyle, 
  getFontFamily 
} from '@/features/public-profile/utils/theme-styles'

export interface BaseWidgetProps {
  theme?: ProfileTheme
  className?: string
  children?: ReactNode
  style?: React.CSSProperties
}

export interface BaseWidgetButtonProps extends BaseWidgetProps {
  onClick?: () => void
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export interface BaseWidgetContainerProps extends BaseWidgetProps {
  withShadow?: boolean
  withGlass?: boolean
  customRadius?: string
}

/**
 * BaseWidget - Componente base que proporciona funcionalidad común para todos los widgets
 * Elimina duplicación de código y centraliza el uso de theme-styles.ts utilities
 */
export class BaseWidget {
  
  /**
   * Button component with consistent theming
   */
  static Button = React.forwardRef<HTMLButtonElement, BaseWidgetButtonProps & { children: ReactNode }>(
    ({ theme, className, children, onClick, variant = 'primary', disabled = false, style, ...props }, ref) => {
      const buttonStyles = theme ? getButtonStyles(theme, variant) : {}
      const hoverStyles = theme ? getButtonHoverStyles(theme) : {}
      
      return (
        <button
          ref={ref}
          className={cn(
            "transition-all duration-200 hover:scale-105 active:scale-95",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
          style={{
            ...buttonStyles,
            ...style,
          }}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          onMouseEnter={(e) => {
            if (!disabled && theme) {
              Object.assign(e.currentTarget.style, hoverStyles)
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled && theme) {
              Object.assign(e.currentTarget.style, buttonStyles)
              e.currentTarget.style.transform = ''
            }
          }}
          {...props}
        >
          {children}
        </button>
      )
    }
  )

  /**
   * Container component with consistent theming
   */
  static Container = React.forwardRef<HTMLDivElement, BaseWidgetContainerProps & { children: ReactNode }>(
    ({ theme, className, children, withShadow = false, withGlass = false, customRadius, style, ...props }, ref) => {
      const containerStyles: React.CSSProperties = {
        borderRadius: customRadius || (theme ? getBorderRadius(theme) : '0.5rem'),
        fontFamily: theme?.font_family ? getFontFamily(theme.font_family) : undefined,
        ...(withShadow && theme && { boxShadow: getShadowStyle(theme) }),
        ...(withGlass && theme?.button_fill === 'glass' && {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }),
        ...style,
      }

      return (
        <div
          ref={ref}
          className={cn("transition-all duration-200", className)}
          style={containerStyles}
          {...props}
        >
          {children}
        </div>
      )
    }
  )

  /**
   * Text component with consistent theming
   */
  static Text = ({ theme, className, children, variant = 'primary', as: Component = 'span', style, inheritColor = false, ...props }: BaseWidgetProps & { 
    children: ReactNode
    variant?: 'primary' | 'secondary' | 'muted'
    as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
    inheritColor?: boolean
  }) => {
      const getTextColor = () => {
        if (!theme) return undefined
        
        // If inheritColor is true, use currentColor (like icons do)
        if (inheritColor) return 'currentColor'
        
        switch (variant) {
          case 'primary':
            return theme.text_color || theme.primary_color
          case 'secondary':
            return theme.primary_color
          case 'muted':
            return `${theme.text_color || theme.primary_color}80` // 50% opacity
          default:
            return theme.text_color || theme.primary_color
        }
      }

      const textStyles: React.CSSProperties = {
        color: getTextColor(),
        fontFamily: theme?.font_family ? getFontFamily(theme.font_family) : undefined,
        ...style,
      }

      return (
        <Component
          className={cn("transition-colors duration-200", className)}
          style={textStyles}
          {...props}
        >
          {children}
        </Component>
      )
  }

  /**
   * Link component with consistent theming
   */
  static Link = React.forwardRef<HTMLAnchorElement, BaseWidgetProps & {
    children: ReactNode
    href: string
    external?: boolean
    variant?: 'primary' | 'secondary'
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  }>(
    ({ theme, className, children, href, external = true, variant = 'primary', style, onClick, ...props }, ref) => {
      const linkStyles = theme ? getButtonStyles(theme, variant) : {}
      const hoverStyles = theme ? getButtonHoverStyles(theme) : {}

      const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onClick) {
          onClick(e)
        }
        if (external) {
          e.preventDefault()
          window.open(href, '_blank', 'noopener,noreferrer')
        }
      }

      return (
        <a
          ref={ref}
          href={external ? undefined : href}
          className={cn(
            "inline-flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer",
            className
          )}
          style={{
            ...linkStyles,
            ...style,
          }}
          onClick={handleClick}
          onMouseEnter={(e) => {
            if (theme) {
              Object.assign(e.currentTarget.style, hoverStyles)
            }
          }}
          onMouseLeave={(e) => {
            if (theme) {
              Object.assign(e.currentTarget.style, linkStyles)
              e.currentTarget.style.transform = ''
            }
          }}
          {...props}
        >
          {children}
        </a>
      )
    }
  )

  /**
   * Utility methods for widgets
   */
  static utils = {
    
    /**
     * Get theme-based styles for any element
     */
    getThemedStyles: (theme?: ProfileTheme, options: {
      withShadow?: boolean
      withGlass?: boolean
      variant?: 'primary' | 'secondary'
    } = {}): React.CSSProperties => {
      if (!theme) return {}

      const { withShadow = false, withGlass = false, variant = 'primary' } = options

      return {
        borderRadius: getBorderRadius(theme),
        fontFamily: getFontFamily(theme.font_family),
        color: variant === 'primary' ? theme.text_color || theme.primary_color : theme.primary_color,
        ...(withShadow && { boxShadow: getShadowStyle(theme) }),
        ...(withGlass && theme.button_fill === 'glass' && {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }),
      }
    },

    /**
     * Get responsive grid classes based on column count
     */
    getGridClasses: (columns: number = 2): string => {
      const gridMap: Record<number, string> = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        6: 'grid-cols-6',
      }
      return `grid ${gridMap[columns] || 'grid-cols-2'} gap-4`
    },

    /**
     * Format price consistently
     */
    formatPrice: (price?: number, currency: string = 'USD'): string => {
      if (!price) return 'Consultar precio'
      return new Intl.NumberFormat('es', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(price)
    }
  }
}

export default BaseWidget
