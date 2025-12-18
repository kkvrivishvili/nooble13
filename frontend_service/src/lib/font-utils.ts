export type Font = 'inter' | 'manrope' | 'system'

export const FONTS: readonly Font[] = ['inter', 'manrope', 'system'] as const

export const updateFontFamily = (font: string) => {
  const root = document.documentElement
  // Remove all font classes
  root.classList.forEach((cls) => {
    if (cls.startsWith('font-')) {
      root.classList.remove(cls)
    }
  })
  // Add the new font class
  root.classList.add(`font-${font}`)
  // Save to localStorage
  localStorage.setItem('font', font)
}

export const initializeFont = () => {
  const savedFont = localStorage.getItem('font') as Font | null
  const font = savedFont && FONTS.includes(savedFont) ? savedFont : 'manrope'
  updateFontFamily(font)
  return font
}
