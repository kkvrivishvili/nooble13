import { usePageContext } from '@/context/page-context'

export function PageTitle() {
  const { title } = usePageContext()
  return <h1 className='text-lg font-semibold'>{title}</h1>
}