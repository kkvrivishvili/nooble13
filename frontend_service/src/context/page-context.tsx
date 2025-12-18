import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface SubPage {
  title: string
  href: string
  isActive?: boolean
  disabled?: boolean
}

interface PageContextType {
  title: string
  setTitle: (title: string) => void
  subPages: SubPage[]
  setSubPages: (subPages: SubPage[]) => void
  clearSubPages: () => void
  shareUrl?: string
  setShareUrl: (url: string | undefined) => void
  mobilePreview: boolean
  setMobilePreview: (enabled: boolean) => void
}

const PageContext = createContext<PageContextType | undefined>(undefined)

export function PageProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState('Dashboard')
  const [subPages, setSubPagesState] = useState<SubPage[]>([])
  const [shareUrl, setShareUrlState] = useState<string | undefined>(undefined)
  const [mobilePreview, setMobilePreviewState] = useState<boolean>(true)
  
  const setTitle = useCallback((newTitle: string) => {
    setTitleState(newTitle)
  }, [])
  
  const setSubPages = useCallback((newSubPages: SubPage[]) => {
    setSubPagesState(newSubPages)
  }, [])
  
  const clearSubPages = useCallback(() => {
    setSubPagesState([])
  }, [])
  
  const setShareUrl = useCallback((url: string | undefined) => {
    setShareUrlState(url)
  }, [])
  
  const setMobilePreview = useCallback((enabled: boolean) => {
    setMobilePreviewState(enabled)
  }, [])
  
  return (
    <PageContext.Provider value={{ 
      title, 
      setTitle, 
      subPages, 
      setSubPages, 
      clearSubPages,
      shareUrl,
      setShareUrl,
      mobilePreview,
      setMobilePreview
    }}>
      {children}
    </PageContext.Provider>
  )
}

export const usePageContext = () => {
  const context = useContext(PageContext)
  if (!context) {
    throw new Error('usePageContext must be used within PageProvider')
  }
  return context
}