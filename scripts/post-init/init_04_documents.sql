-- Nooble8 Documents RAG Schema
-- Version: 5.0 - Snake Case with agent_ids in metadata
-- Description: Document management for RAG system using metadata for agent assignments

-- Step 1: Create documents_rag table (main table for ingestion service)
CREATE TABLE public.documents_rag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User who uploaded the document (tenant_id in backend = user_id)
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, -- Same as profile_id, used internally by backend
  
  -- Collection and document identifiers
  collection_id text NOT NULL, -- Virtual collection ID (generated or provided)
  document_id uuid NOT NULL UNIQUE, -- Document ID in Qdrant
  
  -- Document info
  document_name text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('pdf', 'docx', 'txt', 'html', 'markdown', 'url')),
  
  -- Embedding configuration (must be consistent within collection)
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL,
  encoding_format text DEFAULT 'float',
  chunk_size integer NOT NULL,
  chunk_overlap integer NOT NULL,
  
  -- Status tracking
  total_chunks integer DEFAULT 0,
  processed_chunks integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  
  -- Legacy field for compatibility (will be removed in v2)
  agent_id uuid, -- Can be NULL, or first agent from agent_ids array
  
  -- Metadata including agent assignments
  -- agent_ids array is stored here: {"agent_ids": ["uuid1", "uuid2", ...]}
  metadata jsonb DEFAULT '{"agent_ids": []}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure collection consistency for embeddings
  CONSTRAINT unique_collection_document UNIQUE(collection_id, document_id)
);

-- Step 2: Create indexes for efficient queries
CREATE INDEX idx_documents_rag_profile ON public.documents_rag(profile_id);
CREATE INDEX idx_documents_rag_tenant ON public.documents_rag(tenant_id);
CREATE INDEX idx_documents_rag_collection ON public.documents_rag(collection_id);
CREATE INDEX idx_documents_rag_document ON public.documents_rag(document_id);
CREATE INDEX idx_documents_rag_status ON public.documents_rag(status);

-- Index for agent_ids in metadata (JSONB GIN index)
CREATE INDEX idx_documents_rag_agent_ids ON public.documents_rag 
  USING gin ((metadata->'agent_ids'));

-- Compound index for collection + embedding model (for consistency checks)
CREATE INDEX idx_documents_rag_collection_model ON public.documents_rag(collection_id, embedding_model);

-- Step 3: Add triggers
CREATE TRIGGER update_documents_rag_updated_at 
  BEFORE UPDATE ON public.documents_rag
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Enable RLS
ALTER TABLE public.documents_rag ENABLE ROW LEVEL SECURITY;

-- Step 5: RLS Policies
-- Service role can access all documents (for backend operations)
CREATE POLICY "Service role can access all documents" ON public.documents_rag
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own documents
CREATE POLICY "Users can view their own documents" ON public.documents_rag
  FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

-- Users can insert their own documents
CREATE POLICY "Users can insert their own documents" ON public.documents_rag
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = profile_id);

-- Users can update their own documents (e.g., update agent assignments)
CREATE POLICY "Users can update their own documents" ON public.documents_rag
  FOR UPDATE TO authenticated
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents" ON public.documents_rag
  FOR DELETE TO authenticated
  USING (auth.uid() = profile_id);

-- Step 6: Helper functions

-- Function to get documents by agent ID
CREATE OR REPLACE FUNCTION get_documents_by_agent(p_agent_id uuid)
RETURNS SETOF documents_rag AS $$
BEGIN
  RETURN QUERY
  SELECT d.*
  FROM documents_rag d
  WHERE d.metadata->'agent_ids' ? p_agent_id::text
  ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to update document agents
CREATE OR REPLACE FUNCTION update_document_agents(
  p_document_id uuid,
  p_agent_ids uuid[],
  p_operation text DEFAULT 'set' -- 'set', 'add', 'remove'
)
RETURNS void AS $$
DECLARE
  v_current_agents jsonb;
  v_new_agents jsonb;
BEGIN
  -- Get current agent_ids
  SELECT metadata->'agent_ids' 
  INTO v_current_agents
  FROM documents_rag
  WHERE document_id = p_document_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  
  -- Calculate new agent_ids based on operation
  CASE p_operation
    WHEN 'set' THEN
      v_new_agents := to_jsonb(p_agent_ids);
    WHEN 'add' THEN
      v_new_agents := v_current_agents || to_jsonb(p_agent_ids);
      -- Remove duplicates
      v_new_agents := to_jsonb(ARRAY(SELECT DISTINCT jsonb_array_elements_text(v_new_agents)));
    WHEN 'remove' THEN
      v_new_agents := to_jsonb(
        ARRAY(
          SELECT value 
          FROM jsonb_array_elements_text(v_current_agents) 
          WHERE value::uuid != ALL(p_agent_ids)
        )
      );
    ELSE
      RAISE EXCEPTION 'Invalid operation. Use: set, add, or remove';
  END CASE;
  
  -- Update document
  UPDATE documents_rag
  SET 
    metadata = jsonb_set(metadata, '{agent_ids}', v_new_agents),
    agent_id = CASE 
      WHEN jsonb_array_length(v_new_agents) > 0 
      THEN (v_new_agents->>0)::uuid 
      ELSE NULL 
    END,
    updated_at = now()
  WHERE document_id = p_document_id;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Grant permissions
GRANT ALL ON public.documents_rag TO authenticated;
GRANT ALL ON public.documents_rag TO service_role; -- Full access for backend services
GRANT SELECT ON public.documents_rag TO anon; -- Read-only for anonymous

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_documents_by_agent TO authenticated;
GRANT EXECUTE ON FUNCTION get_documents_by_agent TO service_role;
GRANT EXECUTE ON FUNCTION update_document_agents TO authenticated;
GRANT EXECUTE ON FUNCTION update_document_agents TO service_role;

-- Step 8: Comments for clarity
COMMENT ON TABLE public.documents_rag IS 'Main document storage for RAG system. Agent assignments are stored in metadata.agent_ids array';
COMMENT ON COLUMN public.documents_rag.tenant_id IS 'Same as profile_id (user_id). Used internally by backend services';
COMMENT ON COLUMN public.documents_rag.collection_id IS 'Virtual collection ID. All docs in a collection must use the same embedding model';
COMMENT ON COLUMN public.documents_rag.document_id IS 'Unique document ID used in Qdrant vector store';
COMMENT ON COLUMN public.documents_rag.agent_id IS 'DEPRECATED: Use metadata.agent_ids instead. Kept for backwards compatibility';
COMMENT ON COLUMN public.documents_rag.metadata IS 'JSONB metadata including agent_ids array: {"agent_ids": ["uuid1", "uuid2", ...]}';