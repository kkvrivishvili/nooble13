"""
Handler para chunking jerárquico de documentos.

Implementa chunking que preserva la jerarquía del documento:
- Chunks heredan el contexto de su sección padre
- Se inyectan títulos de sección en cada chunk
- Optimizado para búsqueda híbrida (BM25 + Vector)
"""

import logging
import uuid
import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

from llama_index.core.node_parser import SentenceSplitter

from common.handlers.base_handler import BaseHandler
from ..config.settings import IngestionSettings
from ..models.ingestion_models import ChunkModel


@dataclass
class Section:
    """Representa una sección del documento."""
    title: str
    level: int
    start_char: int
    end_char: Optional[int]
    parent_title: Optional[str]
    content: str = ""


@dataclass
class SpacyEnrichmentData:
    """Datos de enriquecimiento spaCy para un chunk."""
    entities: List[Dict[str, Any]]
    noun_chunks: List[str]
    entities_by_type: Dict[str, List[str]]
    lemmas: List[str]
    language: str


class HierarchicalChunker(BaseHandler):
    """
    Handler para chunking jerárquico con herencia de contexto.
    
    Características:
    - Divide el documento respetando secciones
    - Inyecta contexto de sección en cada chunk
    - Prepara campo BM25 enriquecido con spaCy
    - Soporta diferentes tamaños de chunk (padre/hijo)
    """
    
    def __init__(self, app_settings: IngestionSettings):
        """Inicializa el chunker jerárquico."""
        super().__init__(app_settings)
        
        # Tamaños de chunk
        self.default_chunk_size = app_settings.default_chunk_size
        self.default_chunk_overlap = app_settings.default_chunk_overlap
        
        # Cache de parsers
        self._parsers_cache = {}
    
    def _get_parser(self, chunk_size: int, chunk_overlap: int) -> SentenceSplitter:
        """Obtiene o crea un parser con cache."""
        cache_key = f"{chunk_size}:{chunk_overlap}"
        if cache_key not in self._parsers_cache:
            self._parsers_cache[cache_key] = SentenceSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
                separator=" ",
                paragraph_separator="\n\n",
                secondary_chunking_regex="[^,.;。？！]+[,.;。？！]?"
            )
        return self._parsers_cache[cache_key]
    
    def chunk_document(
        self,
        text: str,
        sections: List[Dict[str, Any]],
        document_id: str,
        tenant_id: str,
        collection_id: str,
        agent_ids: List[str],
        document_name: str,
        document_type: str,
        spacy_enrichment: Optional[Dict[str, Any]] = None,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        page_count: Optional[int] = None
    ) -> List[ChunkModel]:
        """
        Divide un documento en chunks con contexto jerárquico.
        
        Args:
            text: Texto completo del documento (Markdown)
            sections: Lista de secciones detectadas
            document_id: ID del documento
            tenant_id: ID del tenant
            collection_id: ID de la colección
            agent_ids: IDs de agentes con acceso
            document_name: Nombre del documento
            document_type: Tipo de documento
            spacy_enrichment: Enriquecimiento de spaCy
            chunk_size: Tamaño de chunk en caracteres
            chunk_overlap: Overlap entre chunks
            page_count: Número de páginas
            
        Returns:
            Lista de ChunkModel con contexto jerárquico
        """
        self._logger.info(
            f"Starting hierarchical chunking",
            extra={
                "document_id": document_id,
                "text_length": len(text),
                "sections_count": len(sections),
                "chunk_size": chunk_size
            }
        )
        
        # Convertir sections dict a objetos Section
        parsed_sections = self._parse_sections(sections, text)
        
        # Asignar contenido a cada sección
        self._assign_section_content(parsed_sections, text)
        
        # Preparar enrichment data
        enrichment_data = self._prepare_enrichment_data(spacy_enrichment)
        
        # Obtener parser
        parser = self._get_parser(chunk_size, chunk_overlap)
        
        # Chunking por sección para mantener coherencia
        chunks = []
        chunk_index = 0
        
        if parsed_sections:
            # Chunking por sección
            for section in parsed_sections:
                section_chunks = self._chunk_section(
                    section=section,
                    parser=parser,
                    document_id=document_id,
                    tenant_id=tenant_id,
                    collection_id=collection_id,
                    agent_ids=agent_ids,
                    document_name=document_name,
                    document_type=document_type,
                    enrichment_data=enrichment_data,
                    start_index=chunk_index,
                    page_count=page_count
                )
                chunks.extend(section_chunks)
                chunk_index += len(section_chunks)
        else:
            # Sin secciones, chunking plano
            chunks = self._chunk_flat(
                text=text,
                parser=parser,
                document_id=document_id,
                tenant_id=tenant_id,
                collection_id=collection_id,
                agent_ids=agent_ids,
                document_name=document_name,
                document_type=document_type,
                enrichment_data=enrichment_data,
                page_count=page_count
            )
        
        self._logger.info(
            f"Hierarchical chunking completed",
            extra={
                "document_id": document_id,
                "total_chunks": len(chunks),
                "sections_processed": len(parsed_sections)
            }
        )
        
        return chunks
    
    def _parse_sections(
        self,
        sections: List[Dict[str, Any]],
        text: str
    ) -> List[Section]:
        """Convierte dict de secciones a objetos Section."""
        parsed = []
        
        for i, sec in enumerate(sections):
            # Calcular end_char
            end_char = sec.get("end_char")
            if end_char is None and i < len(sections) - 1:
                end_char = sections[i + 1].get("start_char", len(text))
            elif end_char is None:
                end_char = len(text)
            
            parsed.append(Section(
                title=sec.get("title", ""),
                level=sec.get("level", 2),
                start_char=sec.get("start_char", 0),
                end_char=end_char,
                parent_title=sec.get("parent_title")
            ))
        
        return parsed
    
    def _assign_section_content(
        self,
        sections: List[Section],
        text: str
    ):
        """Asigna contenido a cada sección."""
        for section in sections:
            start = section.start_char
            end = section.end_char or len(text)
            section.content = text[start:end].strip()
    
    def _prepare_enrichment_data(
        self,
        spacy_data: Optional[Dict[str, Any]]
    ) -> Optional[SpacyEnrichmentData]:
        """Prepara datos de enrichment de spaCy."""
        if not spacy_data:
            return None
        
        return SpacyEnrichmentData(
            entities=spacy_data.get("entities", []),
            noun_chunks=spacy_data.get("noun_chunks", []),
            entities_by_type=spacy_data.get("entities_by_type", {}),
            lemmas=spacy_data.get("unique_lemmas", []),
            language=spacy_data.get("language", "es")
        )
    
    def _chunk_section(
        self,
        section: Section,
        parser: SentenceSplitter,
        document_id: str,
        tenant_id: str,
        collection_id: str,
        agent_ids: List[str],
        document_name: str,
        document_type: str,
        enrichment_data: Optional[SpacyEnrichmentData],
        start_index: int,
        page_count: Optional[int]
    ) -> List[ChunkModel]:
        """
        Genera chunks de una sección con contexto.
        """
        chunks = []
        
        # Si la sección está vacía o muy corta, saltarla
        if not section.content or len(section.content.strip()) < 50:
            return chunks
        
        # Construir contexto de sección
        section_context = self._build_section_context(section, document_name)
        
        # Dividir contenido de la sección
        from llama_index.core import Document
        doc = Document(text=section.content)
        nodes = parser.get_nodes_from_documents([doc])
        
        for i, node in enumerate(nodes):
            content = node.get_content().strip()
            if not content:
                continue
            
            # Crear contenido contextualizado
            content_contextualized = f"{section_context}\n\n{content}"
            
            # Extraer entidades/noun_chunks relevantes a este chunk
            chunk_entities, chunk_noun_chunks = self._extract_chunk_enrichment(
                content, enrichment_data
            )
            
            # Crear ChunkModel
            chunk = ChunkModel(
                chunk_id=str(uuid.uuid4()),
                document_id=document_id,
                tenant_id=tenant_id,
                
                # Contenido contextualizado (para embeddings)
                content=content_contextualized,
                content_raw=content,
                
                chunk_index=start_index + i,
                collection_id=collection_id,
                agent_ids=agent_ids,
                
                # Campos agnósticos
                search_anchors=[],  # Se pueden agregar si se usa LLM enrichment
                atomic_facts=[],
                fact_density=0.5,
                document_nature=self._detect_document_nature(document_type),
                normalized_entities=self._normalize_entities(chunk_entities),
                
                # Campos de spaCy
                spacy_entities=chunk_entities,
                spacy_noun_chunks=chunk_noun_chunks,
                
                # Metadata estructural
                document_type=document_type,
                document_name=document_name,
                language=enrichment_data.language if enrichment_data else "es",
                page_count=page_count,
                has_tables='|' in content,
                
                # Contexto de sección
                section_title=section.title,
                section_level=section.level,
                section_context=section_context,
                
                keywords=[],
                tags=[],
                
                metadata={
                    "section_title": section.title,
                    "section_level": section.level,
                    "parent_section": section.parent_title,
                    "word_count": len(content.split()),
                    "preprocessing_used": False,
                    "extraction_method": "hierarchical_chunking"
                }
            )
            
            chunks.append(chunk)
        
        return chunks
    
    def _chunk_flat(
        self,
        text: str,
        parser: SentenceSplitter,
        document_id: str,
        tenant_id: str,
        collection_id: str,
        agent_ids: List[str],
        document_name: str,
        document_type: str,
        enrichment_data: Optional[SpacyEnrichmentData],
        page_count: Optional[int]
    ) -> List[ChunkModel]:
        """
        Chunking plano para documentos sin secciones.
        """
        chunks = []
        
        from llama_index.core import Document
        doc = Document(text=text)
        nodes = parser.get_nodes_from_documents([doc])
        
        # Contexto genérico
        base_context = f"En el documento '{document_name}':"
        
        for i, node in enumerate(nodes):
            content = node.get_content().strip()
            if not content:
                continue
            
            content_contextualized = f"{base_context}\n\n{content}"
            
            chunk_entities, chunk_noun_chunks = self._extract_chunk_enrichment(
                content, enrichment_data
            )
            
            chunk = ChunkModel(
                chunk_id=str(uuid.uuid4()),
                document_id=document_id,
                tenant_id=tenant_id,
                content=content_contextualized,
                content_raw=content,
                chunk_index=i,
                collection_id=collection_id,
                agent_ids=agent_ids,
                search_anchors=[],
                atomic_facts=[],
                fact_density=0.5,
                document_nature=self._detect_document_nature(document_type),
                normalized_entities=self._normalize_entities(chunk_entities),
                spacy_entities=chunk_entities,
                spacy_noun_chunks=chunk_noun_chunks,
                document_type=document_type,
                document_name=document_name,
                language=enrichment_data.language if enrichment_data else "es",
                page_count=page_count,
                has_tables='|' in content,
                section_title=None,
                section_level=None,
                section_context=base_context,
                keywords=[],
                tags=[],
                metadata={
                    "word_count": len(content.split()),
                    "preprocessing_used": False,
                    "extraction_method": "flat_chunking"
                }
            )
            
            chunks.append(chunk)
        
        return chunks
    
    def _build_section_context(
        self,
        section: Section,
        document_name: str
    ) -> str:
        """Construye el contexto de una sección para inyectar en chunks."""
        parts = [f"En el documento '{document_name}'"]
        
        if section.parent_title:
            parts.append(f"sección '{section.parent_title}'")
        
        parts.append(f"subsección '{section.title}':")
        
        return ", ".join(parts[:-1]) + " " + parts[-1] if len(parts) > 1 else parts[0]
    
    def _extract_chunk_enrichment(
        self,
        content: str,
        enrichment_data: Optional[SpacyEnrichmentData]
    ) -> Tuple[List[Dict], List[str]]:
        """
        Extrae entidades y noun_chunks relevantes a un chunk específico.
        """
        if not enrichment_data:
            return [], []
        
        content_lower = content.lower()
        
        # Filtrar entidades que aparecen en este chunk
        chunk_entities = [
            ent for ent in enrichment_data.entities
            if ent.get("text", "").lower() in content_lower
        ]
        
        # Filtrar noun chunks que aparecen en este chunk
        chunk_noun_chunks = [
            nc for nc in enrichment_data.noun_chunks
            if nc.lower() in content_lower
        ]
        
        return chunk_entities, chunk_noun_chunks
    
    def _normalize_entities(
        self,
        entities: List[Dict]
    ) -> Dict[str, Any]:
        """Normaliza entidades para filtrado estructurado."""
        normalized = {}
        
        for ent in entities:
            label = ent.get("label", "").lower()
            text = ent.get("text", "")
            
            # Mapear labels de spaCy a nuestro schema
            key_map = {
                "per": "person",
                "person": "person",
                "org": "organization",
                "gpe": "location",
                "loc": "location",
                "date": "date",
                "money": "amount",
                "time": "date"
            }
            
            key = key_map.get(label, label)
            
            if key and text:
                if key not in normalized:
                    normalized[key] = text
                elif isinstance(normalized[key], list):
                    if text not in normalized[key]:
                        normalized[key].append(text)
                else:
                    normalized[key] = [normalized[key], text]
        
        return normalized
    
    def _detect_document_nature(self, document_type: str) -> str:
        """Detecta la naturaleza del documento basado en tipo."""
        type_map = {
            "pdf": "other",
            "docx": "other",
            "txt": "narrative",
            "md": "technical",
            "html": "narrative",
            "markdown": "technical"
        }
        return type_map.get(document_type.lower(), "other")
