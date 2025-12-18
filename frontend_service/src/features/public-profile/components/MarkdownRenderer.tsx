import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
  textColor?: string
}

const MarkdownRenderer = memo(({ content, className, textColor }: MarkdownRendererProps) => {
  return (
    <ReactMarkdown
      className={cn('prose prose-sm max-w-none', className)}
      remarkPlugins={[remarkGfm]}
      components={{
        // Personalizar elementos para mantener consistencia con el tema
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mb-2 mt-0" style={{ color: textColor }}>
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mb-2 mt-0" style={{ color: textColor }}>
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-bold mb-1 mt-0" style={{ color: textColor }}>
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-2 last:mb-0" style={{ color: textColor }}>
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-1" style={{ color: textColor }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-1" style={{ color: textColor }}>
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-sm" style={{ color: textColor }}>
            {children}
          </li>
        ),
        blockquote: ({ children }) => (
          <blockquote 
            className="border-l-2 pl-3 mb-2 italic opacity-80"
            style={{ 
              borderColor: textColor,
              color: textColor 
            }}
          >
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code 
                className="px-1 py-0.5 rounded text-xs font-mono bg-black/10 whitespace-pre-wrap"
                style={{ color: textColor }}
              >
                {children}
              </code>
            )
          }
          return (
            <code 
              className="block p-2 rounded text-xs font-mono bg-black/10 mb-2 overflow-x-auto whitespace-pre"
              style={{ color: textColor }}
            >
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto">
            {children}
          </pre>
        ),
        strong: ({ children }) => (
          <strong className="font-bold" style={{ color: textColor }}>
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em className="italic" style={{ color: textColor }}>
            {children}
          </em>
        ),
        a: ({ children, href }) => (
          <a 
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
            style={{ color: textColor }}
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="min-w-full border-collapse border border-gray-300">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th 
            className="border border-gray-300 px-2 py-1 text-xs font-bold bg-black/5"
            style={{ color: textColor }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td 
            className="border border-gray-300 px-2 py-1 text-xs"
            style={{ color: textColor }}
          >
            {children}
          </td>
        ),
        // Soporte para tareas (GitHub Flavored Markdown)
        input: ({ type, checked, disabled }) => {
          if (type === 'checkbox') {
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                className="mr-2"
                readOnly
              />
            )
          }
          return null
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

export default MarkdownRenderer
