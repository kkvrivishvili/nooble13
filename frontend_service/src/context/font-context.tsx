import React, { createContext, useContext, useEffect, useState } from 'react'
import { FONTS, type Font, updateFontFamily } from '@/lib/font-utils'

export type FontType = Font

interface FontContextType {
  font: Font
  setFont: (font: Font) => void
}

const FontContext = createContext<FontContextType | undefined>(undefined)

export const FontProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [font, _setFont] = useState<Font>(() => {
    const savedFont = localStorage.getItem('font')
    return FONTS.includes(savedFont as Font) ? (savedFont as Font) : 'manrope'
  })

  // Initialize font on component mount
  useEffect(() => {
    const savedFont = localStorage.getItem('font') || 'manrope'
    if (savedFont !== font) {
      _setFont(savedFont as Font)
    }
    updateFontFamily(savedFont)
    // We only want to run this effect once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setFont = (newFont: Font) => {
    if (newFont !== font) {
      _setFont(newFont)
      updateFontFamily(newFont)
    }
  }

  return <FontContext.Provider value={{ font, setFont }}>{children}</FontContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFont = () => {
  const context = useContext(FontContext)
  if (!context) {
    throw new Error('useFont must be used within a FontProvider')
  }
  return context
}
