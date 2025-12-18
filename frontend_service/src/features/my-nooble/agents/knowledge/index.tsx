// src/features/my-nooble/agents/knowledge/index.tsx - Fixed upload handling
import { Progress } from '@/components/ui/progress'
import { useEffect, useCallback, useState, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { usePageContext } from '@/context/page-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { 
  IconUpload, 
  IconFile, 
  IconFileText,
  IconLink,
  IconTrash,
  IconEdit,
  IconSearch,
  IconPlus,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ingestionApi, type DocumentRecord } from '@/api/ingestion-api'
import { agentsApi } from '@/api/agents-api'
import { supabase } from '@/lib/supabase'

interface UploadProgress {
  taskId: string
  fileName: string
  status: string
  percentage: number
  message: string
}

export default function AgentsKnowledgePage() {
  const { setSubPages } = usePageContext()
  const location = useLocation()
  const queryClient = useQueryClient()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterAgent, setFilterAgent] = useState<string>('all')
  const [isDragging, setIsDragging] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null)
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<DocumentRecord | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({})
  const websocketsRef = useRef<Record<string, WebSocket>>({} as Record<string, WebSocket>)

  const updateSubPages = useCallback(() => {
    const currentPath = location.pathname
    const subPages = [
      {
        title: 'My Agents',
        href: '/my-nooble/agents/agents',
        isActive: currentPath === '/my-nooble/agents/agents'
      },
      {
        title: 'Knowledge',
        href: '/my-nooble/agents/knowledge',
        isActive: currentPath === '/my-nooble/agents/knowledge'
      },
      {
        title: 'Tools',
        href: '/my-nooble/agents/tools',
        isActive: currentPath === '/my-nooble/agents/tools'
      }
    ]
    setSubPages(subPages)
  }, [location.pathname, setSubPages])

  useEffect(() => {
    updateSubPages()
    return () => {
      setSubPages([])
      // Clean up websockets on unmount
      const sockets = websocketsRef.current
      Object.values(sockets).forEach(ws => {
        try { ws.close() } catch (e) { void e }
      })
    }
  }, [updateSubPages, setSubPages])

  // Get user's documents
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['user-documents'],
    queryFn: () => ingestionApi.getUserDocuments(),
    refetchInterval: (query) => {
      // Refetch every 5 seconds if any document is processing
      const documents = query.state.data;
      const hasProcessing = Array.isArray(documents) && documents.some(doc => doc.status === 'processing');
      return hasProcessing ? 5000 : false;
    }
  })

  // Get user's agents
  const { data: agents = [] } = useQuery({
    queryKey: ['user-agents'],
    queryFn: () => agentsApi.getUserAgents(),
  })

  // Upload requirements: must have at least one agent
  const hasAgents = Array.isArray(agents) && agents.length > 0
  const defaultAgentId = hasAgents ? agents[0].id : undefined

  // Get knowledge stats
  const { data: stats } = useQuery({
    queryKey: ['knowledge-stats'],
    queryFn: () => ingestionApi.getKnowledgeStats(),
    refetchInterval: 30000 // Every 30 seconds
  })

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, agentIds }: { file: File; agentIds: string[] }) => {
      return ingestionApi.uploadDocument(file, agentIds)
    },
    onSuccess: async (response, variables) => {
      // Set initial progress
      setUploadProgress(prev => ({
        ...prev,
        [response.task_id]: {
          taskId: response.task_id,
          fileName: variables.file.name,
          status: 'processing',
          percentage: 10,
          message: 'Processing document...'
        }
      }))
      
      // Create WebSocket for progress
      const token = await getAuthToken()
      const ws = ingestionApi.createProgressWebSocket(response.task_id, token)
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        const msgType = data.message_type || data.type
        if (msgType === 'ingestion_progress') {
          const progress = data.data
          const normalizedStatus = String(progress.status || '').toLowerCase()
          setUploadProgress(prev => ({
            ...prev,
            [progress.task_id]: {
              taskId: progress.task_id,
              fileName: variables.file.name,
              status: normalizedStatus,
              percentage: progress.percentage ?? 0,
              message: progress.message
            }
          }))
          
          if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
            // Close websocket and refresh data
            ws.close()
            queryClient.invalidateQueries({ queryKey: ['user-documents'] })
            queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] })
            
            // Show notification
            if (normalizedStatus === 'completed') {
              toast.success(`Document uploaded successfully: ${variables.file.name}`)
            } else {
              toast.error(`Failed to upload document: ${progress.error || 'Unknown error'}`)
            }
            
            // Remove from progress after 3 seconds
            setTimeout(() => {
              setUploadProgress(prev => {
                const newProgress = { ...prev }
                delete newProgress[progress.task_id]
                return newProgress
              })
            }, 3000)
          }
        }
      }
      
      websocketsRef.current[response.task_id] = ws
    },
    onError: (error: Error) => {
      toast.error('Failed to upload document: ' + error.message)
    }
  })

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: async (doc: DocumentRecord) => {
      return ingestionApi.deleteDocument(doc.document_id, doc.collection_id)
    },
    onSuccess: () => {
      toast.success('Document deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['user-documents'] })
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] })
      setDeleteConfirmDoc(null)
    },
    onError: (error: Error) => {
      toast.error('Failed to delete document: ' + error.message)
    }
  })

  // Update document agents mutation
  const updateAgentsMutation = useMutation({
    mutationFn: async ({ documentId, agentIds }: { documentId: string; agentIds: string[] }) => {
      return ingestionApi.updateDocumentAgents(documentId, agentIds, 'set')
    },
    onSuccess: () => {
      toast.success('Agent assignments updated')
      queryClient.invalidateQueries({ queryKey: ['user-documents'] })
      setIsEditDialogOpen(false)
      setEditingDocument(null)
    },
    onError: (error: Error) => {
      toast.error('Failed to update agents: ' + error.message)
    }
  })


  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
      case 'docx':
        return IconFileText
      case 'txt':
      case 'markdown':
        return IconFile
      case 'url':
        return IconLink
      default:
        return IconFile
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    // Guard: require at least one agent
    if (!hasAgents || !defaultAgentId) {
      toast.error('You must create an agent before uploading documents.')
      return
    }

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      uploadMutation.mutate({ file, agentIds: [defaultAgentId] })
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Guard: require at least one agent
    if (!hasAgents || !defaultAgentId) {
      toast.error('You must create an agent before uploading documents.')
      return
    }

    const files = Array.from(e.target.files || [])
    for (const file of files) {
      uploadMutation.mutate({ file, agentIds: [defaultAgentId] })
    }
  }

  const handleEdit = (doc: DocumentRecord) => {
    setEditingDocument(doc)
    setSelectedAgentIds(doc.metadata?.agent_ids || [])
    setIsEditDialogOpen(true)
  }

  const handleSaveEdit = () => {
    if (!editingDocument) return
    updateAgentsMutation.mutate({
      documentId: editingDocument.document_id,
      agentIds: selectedAgentIds
    })
  }

  const handleDelete = (doc: DocumentRecord) => {
    setDeleteConfirmDoc(doc)
  }

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    )
  }

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || ''
  }

  // Filtering
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.document_name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'all' || doc.document_type === filterType
    const matchesAgent = filterAgent === 'all' || 
      (doc.metadata?.agent_ids || []).includes(filterAgent)
    return matchesSearch && matchesType && matchesAgent
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Knowledge Base</CardTitle>
            {stats && (
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{stats.total_documents} documents</span>
                <span>{stats.total_chunks} chunks</span>
                <span>{stats.agents_with_knowledge} agents with knowledge</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-gray-300 dark:border-gray-700'
            } ${!hasAgents ? 'opacity-60 pointer-events-none' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <IconUpload size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium mb-2">Drag and drop files here</p>
            <p className="text-sm text-gray-500 mb-4">
              or click to select files
            </p>
            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              accept=".pdf,.txt,.doc,.docx,.html,.md"
              onChange={handleFileSelect}
            />
            {hasAgents ? (
              <label htmlFor="file-upload">
                <Button variant="outline" asChild>
                  <span>
                    <IconPlus size={16} className="mr-2" />
                    Select files
                  </span>
                </Button>
              </label>
            ) : (
              <Button variant="outline" disabled>
                <IconPlus size={16} className="mr-2" />
                Select files
              </Button>
            )}
            <p className="text-xs text-gray-500 mt-4">
              Supported formats: PDF, TXT, DOC, DOCX, HTML, Markdown
            </p>
            {!hasAgents && (
              <p className="text-sm text-yellow-600 mt-2">
                Create an agent first to upload knowledge.
              </p>
            )}
          </div>

          {/* Upload Progress */}
          {Object.values(uploadProgress).length > 0 && (
            <div className="space-y-2">
              {Object.values(uploadProgress).map(progress => (
                <div key={progress.taskId} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{progress.fileName}</span>
                    <Badge variant={
                      progress.status === 'completed' ? 'default' :
                      progress.status === 'failed' ? 'destructive' : 'secondary'
                    }>
                      {progress.status}
                    </Badge>
                  </div>
                  <Progress value={progress.percentage} className="h-2 mb-1" />
                  <p className="text-xs text-muted-foreground">{progress.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="txt">Text</SelectItem>
                <SelectItem value="docx">Document</SelectItem>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAgent} onValueChange={setFilterAgent}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Documents Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Assigned agents</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <IconLoader2 className="animate-spin mx-auto" size={24} />
                    </TableCell>
                  </TableRow>
                ) : filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      {searchTerm ? 'No results found' : 'No documents uploaded yet'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map((doc) => {
                    const FileIcon = getFileIcon(doc.document_type)
                    const agentIds = doc.metadata?.agent_ids || []
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileIcon size={20} className="text-gray-500" />
                            <span className="font-medium">{doc.document_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{doc.document_type.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            doc.status === 'completed' ? 'default' :
                            doc.status === 'failed' ? 'destructive' : 'secondary'
                          }>
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.processed_chunks}/{doc.total_chunks}
                        </TableCell>
                        <TableCell>
                          {format(new Date(doc.created_at), 'dd/MM/yyyy', { locale: es })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {agentIds.map((agentId) => {
                              const agent = agents.find(a => a.id === agentId)
                              return agent ? (
                                <Badge key={agentId} variant="outline" className="text-xs">
                                  {agent.name}
                                </Badge>
                              ) : null
                            })}
                            {agentIds.length === 0 && (
                              <span className="text-sm text-gray-500">Not assigned</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(doc)}
                              disabled={doc.status !== 'completed'}
                            >
                              <IconEdit size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDelete(doc)}
                            >
                              <IconTrash size={16} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign agents</DialogTitle>
            <DialogDescription>
              Select the agents that will have access to this document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedAgentIds.includes(agent.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => toggleAgentSelection(agent.id)}
                >
                  <div>
                    <p className="font-medium">{agent.name}</p>
                    <p className="text-sm text-gray-500">{agent.description}</p>
                  </div>
                  {selectedAgentIds.includes(agent.id) && (
                    <IconCheck size={20} className="text-primary" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false)
                setEditingDocument(null)
                setSelectedAgentIds([])
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateAgentsMutation.isPending}>
              {updateAgentsMutation.isPending ? (
                <>
                  <IconLoader2 className="mr-2 animate-spin" size={16} />
                  Saving...
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmDoc} onOpenChange={() => setDeleteConfirmDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmDoc?.document_name}"? 
              This will remove the document and all its chunks from the knowledge base.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmDoc && deleteMutation.mutate(deleteConfirmDoc)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Document'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}