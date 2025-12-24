-- ============================================
-- Nooble8 Database Schema
-- File: init_05_documents.sql
-- Description: Documents for RAG system
-- Version: 6.0
-- ============================================

-- ============================================
-- DOCUMENTS RAG TABLE
-- ============================================

CREATE TABLE public.documents_rag (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Owner
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Collection and document identifiers
    collection_id text NOT NULL,
    document_id uuid NOT NULL UNIQUE,  -- ID in Qdrant
    
    -- Document info
    document_name text NOT NULL,
    document_type text NOT NULL CHECK (document_type IN ('pdf', 'docx', 'txt', 'html', 'markdown', 'url')),
    
    -- Embedding configuration (must be consistent within collection)
    embedding_model text NOT NULL,
    embedding_dimensions integer NOT NULL,
    encoding_format text DEFAULT 'float',
    chunk_size integer NOT NULL,
    chunk_overlap integer NOT NULL,
    
    -- Processing status
    total_chunks integer DEFAULT 0,
    processed_chunks integer DEFAULT 0,
    status document_status NOT NULL DEFAULT 'pending',
    error_message text,
    
    -- Agent assignments (which agents can use this document)
    agent_ids jsonb DEFAULT '[]'::jsonb,
    
    -- Additional metadata
    metadata jsonb DEFAULT '{}'::jsonb,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    -- Ensure unique document per collection
    CONSTRAINT documents_rag_unique_collection_doc UNIQUE(collection_id, document_id)
);

-- Indexes
CREATE INDEX idx_documents_rag_user ON public.documents_rag(user_id);
CREATE INDEX idx_documents_rag_collection ON public.documents_rag(collection_id);
CREATE INDEX idx_documents_rag_document ON public.documents_rag(document_id);
CREATE INDEX idx_documents_rag_status ON public.documents_rag(status);
CREATE INDEX idx_documents_rag_agent_ids ON public.documents_rag USING gin(agent_ids);
CREATE INDEX idx_documents_rag_user_status ON public.documents_rag(user_id, status);
CREATE INDEX idx_documents_rag_collection_model ON public.documents_rag(collection_id, embedding_model);

-- Trigger: Auto-update updated_at
CREATE TRIGGER update_documents_rag_updated_at 
    BEFORE UPDATE ON public.documents_rag
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.documents_rag ENABLE ROW LEVEL SECURITY;

-- Users can view their own documents
CREATE POLICY "Users can view their own documents"
    ON public.documents_rag
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can create their own documents
CREATE POLICY "Users can create their own documents"
    ON public.documents_rag
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own documents
CREATE POLICY "Users can update their own documents"
    ON public.documents_rag
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
    ON public.documents_rag
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to documents"
    ON public.documents_rag
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function: Get documents by agent ID
CREATE OR REPLACE FUNCTION get_documents_by_agent(p_agent_id uuid)
RETURNS SETOF documents_rag AS $$
BEGIN
    RETURN QUERY
    SELECT d.*
    FROM documents_rag d
    WHERE d.agent_ids ? p_agent_id::text
    ORDER BY d.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Update document agents
CREATE OR REPLACE FUNCTION update_document_agents(
    p_document_id uuid,
    p_agent_ids uuid[],
    p_operation text DEFAULT 'set'  -- 'set', 'add', 'remove'
)
RETURNS void AS $$
DECLARE
    v_current_agents jsonb;
    v_new_agents jsonb;
BEGIN
    -- Get current agent_ids
    SELECT agent_ids INTO v_current_agents
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
        agent_ids = v_new_agents,
        updated_at = now()
    WHERE document_id = p_document_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Count user's documents
CREATE OR REPLACE FUNCTION count_user_documents(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::integer 
        FROM documents_rag 
        WHERE user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Count user's total chunks
CREATE OR REPLACE FUNCTION count_user_chunks(p_user_id uuid)
RETURNS integer AS $$
BEGIN
    RETURN (
        SELECT COALESCE(SUM(total_chunks), 0)::integer 
        FROM documents_rag 
        WHERE user_id = p_user_id AND status = 'completed'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- GRANTS
-- ============================================

GRANT ALL ON public.documents_rag TO authenticated;
GRANT ALL ON public.documents_rag TO service_role;

GRANT EXECUTE ON FUNCTION get_documents_by_agent TO authenticated;
GRANT EXECUTE ON FUNCTION get_documents_by_agent TO service_role;

GRANT EXECUTE ON FUNCTION update_document_agents TO authenticated;
GRANT EXECUTE ON FUNCTION update_document_agents TO service_role;

GRANT EXECUTE ON FUNCTION count_user_documents TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_documents TO service_role;

GRANT EXECUTE ON FUNCTION count_user_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION count_user_chunks TO service_role;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.documents_rag IS 'Documents processed for RAG system. Chunks stored in Qdrant vector DB.';

COMMENT ON COLUMN public.documents_rag.user_id IS 'Owner of the document';
COMMENT ON COLUMN public.documents_rag.collection_id IS 'Virtual collection ID - all docs in collection must use same embedding model';
COMMENT ON COLUMN public.documents_rag.document_id IS 'Unique document ID used in Qdrant vector store';
COMMENT ON COLUMN public.documents_rag.agent_ids IS 'Array of agent UUIDs that can access this document for RAG';
COMMENT ON COLUMN public.documents_rag.total_chunks IS 'Total number of chunks created from document';
COMMENT ON COLUMN public.documents_rag.processed_chunks IS 'Number of chunks successfully processed';
