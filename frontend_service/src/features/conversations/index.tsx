import { useEffect } from 'react'
import { usePageContext } from '@/context/page-context'

export default function Users() {
  const { setTitle } = usePageContext()
  
  useEffect(() => {
    setTitle('Conversations Flow')
  }, [setTitle])

  // Parse user list
  
  return (
      <div className='mb-2 flex items-center justify-between space-y-2'>
        <div>
          <p className='text-muted-foreground'>
           Conversation Flow here!!! perfecto.
          </p>
        </div>
      </div>
  )
}