"""
Handler para preprocesamiento de documentos con LLM.

Orquesta la división del documento en bloques, envío al LLM,
y parseo de resultados en secciones enriquecidas.
"""

import logging
import re
from typing import List, Dict, Any, Tuple, Optional

from common.handlers.base_handler import BaseHandler

from ..clients.groq_client import GroqClient, GroqClientError
from ..prompts.document_preprocess import (
    BlockMetadata,
    build_preprocessing_input,
    get_system_prompt
)
from ..models.preprocessing_models import (
    EnrichedSection,
    PreprocessingResult,
    parse_llm_output
)
from ..config.settings import IngestionSettings


# Constantes para división de bloques
DEFAULT_TOKENS_PER_BLOCK = 3000
DEFAULT_OVERLAP_TOKENS = 300
CHARS_PER_TOKEN = 4  # Aproximación conservadora


class PreprocessHandler(BaseHandler):
    """
    Handler para preprocesamiento de documentos usando LLM.
    
    Responsabilidades:
    - Dividir documento en bloques manejables
    - Enviar cada bloque al LLM para formateo
    - Parsear respuestas en EnrichedSection
    - Manejar errores y fallbacks
    """
    
    def __init__(
        self,
        app_settings: IngestionSettings,
        groq_client: Optional[GroqClient] = None
    ):
        """
        Inicializa el handler.
        
        Args:
            app_settings: Configuración de la aplicación
            groq_client: Cliente Groq (opcional, se crea si no se proporciona)
        """
        super().__init__(app_settings)
        
        self.enabled = getattr(app_settings, 'enable_document_preprocessing', True)
        self.model = getattr(app_settings, 'preprocessing_model', 'deepseek-r1-distill-llama-70b')
        self.max_tokens_per_block = getattr(
            app_settings, 
            'preprocessing_max_tokens_per_block', 
            DEFAULT_TOKENS_PER_BLOCK
        )
        
        # Inicializar cliente Groq si está habilitado
        self.groq_client = groq_client
        if self.enabled and not self.groq_client:
            groq_api_key = getattr(app_settings, 'groq_api_key', None)
            if groq_api_key:
                self.groq_client = GroqClient(api_key=groq_api_key)
            else:
                self._logger.warning(
                    "Preprocessing enabled but no Groq API key provided. "
                    "Preprocessing will be disabled."
                )
                self.enabled = False
        
        self._logger.info(
            f"PreprocessHandler initialized",
            extra={
                "enabled": self.enabled,
                "model": self.model,
                "max_tokens_per_block": self.max_tokens_per_block
            }
        )
    
    async def preprocess_document(
        self,
        content: str,
        document_name: str,
        document_type: str,
        page_count: Optional[int] = None
    ) -> PreprocessingResult:
        """
        Preprocesa un documento completo.
        
        Args:
            content: Contenido crudo del documento
            document_name: Nombre del documento
            document_type: Tipo de documento (pdf, docx, etc.)
            page_count: Número de páginas (opcional)
            
        Returns:
            PreprocessingResult con secciones enriquecidas
        """
        result = PreprocessingResult(
            document_name=document_name,
            document_type=document_type,
            was_preprocessed=False
        )
        
        # Verificar si está habilitado
        self._logger.info(
            f"--- [PREPROCESSOR START] ---",
            extra={
                "document_name": document_name,
                "document_type": document_type,
                "preprocessor_enabled": self.enabled,
                "model": self.model
            }
        )

        if not self.enabled:
            self._logger.info(
                f"[PREPROCESSOR] Preprocessing disabled or missing requirement, skipping LLM.",
                extra={"document_name": document_name}
            )
            # Crear sección única con contenido sin procesar
            result.sections = [self._create_fallback_section(content, document_name)]
            result.total_sections = 1
            return result
        
        try:
            # Dividir en bloques
            blocks = self._split_into_blocks(content)
            total_blocks = len(blocks)
            
            self._logger.info(
                f"[PREPROCESSOR] Document split into {total_blocks} blocks",
                extra={
                    "document_name": document_name,
                    "total_blocks": total_blocks,
                    "content_length": len(content),
                    "avg_block_size": len(content) // total_blocks if total_blocks > 0 else 0
                }
            )
            
            # Procesar cada bloque
            all_sections: List[EnrichedSection] = []
            total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            last_context = None
            last_section_id = None
            
            for i, block in enumerate(blocks):
                block_num = i + 1
                self._logger.info(f"--- [PREPROCESSOR BLOCK {block_num}/{total_blocks}] ---")
                is_continuation = i > 0
                
                # Construir metadata del bloque
                metadata = BlockMetadata(
                    document_name=document_name,
                    document_type=document_type,
                    total_pages=page_count or 0,
                    block_number=block_num,
                    total_blocks=total_blocks,
                    is_continuation=is_continuation,
                    previous_context=last_context,
                    last_section_id=last_section_id
                )
                
                # Procesar bloque
                try:
                    sections, usage = await self._process_block(block, metadata)
                    
                    # Acumular resultados
                    all_sections.extend(sections)
                    for key in total_usage:
                        total_usage[key] += usage.get(key, 0)
                    
                    # Actualizar contexto para siguiente bloque
                    if sections:
                        last_section = sections[-1]
                        last_context = last_section.context_breadcrumb
                        last_section_id = last_section.section_id
                    
                except GroqClientError as e:
                    error_msg = f"Block {block_num} failed: {str(e)}"
                    self._logger.error(error_msg)
                    result.processing_errors.append(error_msg)
                    
                    # Fallback: crear sección cruda para este bloque
                    fallback = self._create_fallback_section(
                        block, 
                        document_name,
                        f"sec_{len(all_sections) + 1:03d}"
                    )
                    all_sections.append(fallback)
            
            # Renumerar secciones para consistencia
            all_sections = self._renumber_sections(all_sections)
            
            result.sections = all_sections
            result.total_sections = len(all_sections)
            result.llm_usage = total_usage
            result.was_preprocessed = True
            
            self._logger.info(
                f"Document preprocessing completed",
                extra={
                    "document_name": document_name,
                    "total_sections": len(all_sections),
                    "total_tokens": total_usage.get("total_tokens", 0),
                    "errors": len(result.processing_errors)
                }
            )
            
            return result
            
        except Exception as e:
            self._logger.error(
                f"Document preprocessing failed completely: {e}",
                extra={"document_name": document_name},
                exc_info=True
            )
            
            # Fallback completo: retornar contenido sin procesar
            result.sections = [self._create_fallback_section(content, document_name)]
            result.total_sections = 1
            result.processing_errors.append(f"Complete failure: {str(e)}")
            return result
    
    async def _process_block(
        self,
        block_content: str,
        metadata: BlockMetadata
    ) -> Tuple[List[EnrichedSection], Dict[str, int]]:
        """
        Procesa un bloque individual con el LLM.
        
        Args:
            block_content: Contenido del bloque
            metadata: Metadata del bloque
            
        Returns:
            Tuple de (secciones parseadas, uso de tokens)
        """
        # Construir input
        input_text = build_preprocessing_input(block_content, metadata)
        system_prompt = get_system_prompt()
        
        # Llamar al LLM
        raw_output, usage = await self.groq_client.preprocess_document(
            system_prompt=system_prompt,
            content=input_text,
            model=self.model
        )
        
        # Parsear respuesta
        sections = parse_llm_output(raw_output)
        
        self._logger.debug(
            f"Block {metadata.block_number} processed",
            extra={
                "sections_found": len(sections),
                "tokens_used": usage.get("total_tokens", 0)
            }
        )
        
        return sections, usage
    
    def _split_into_blocks(self, content: str) -> List[str]:
        """
        Divide el contenido en bloques manejables para el LLM.
        
        Usa puntos de corte naturales (párrafos, secciones) cuando es posible.
        
        Args:
            content: Contenido completo del documento
            
        Returns:
            Lista de bloques de texto
        """
        # Calcular tamaño objetivo en caracteres (asegurar int)
        target_chars = int(self.max_tokens_per_block * CHARS_PER_TOKEN)
        overlap_chars = int(DEFAULT_OVERLAP_TOKENS * CHARS_PER_TOKEN)
        
        # Si el contenido es menor al target, retornar como único bloque
        if len(content) <= target_chars:
            return [content]
        
        blocks = []
        position = 0
        
        while position < len(content):
            # Calcular fin tentativo del bloque
            end_position = min(position + target_chars, len(content))
            
            # Si no es el último bloque, buscar punto de corte natural
            if end_position < len(content):
                end_position = int(self._find_natural_break(
                    content, 
                    position, 
                    end_position
                ))
            
            # Extraer bloque
            block = content[position:end_position].strip()
            if block:
                blocks.append(block)
            
            # Avanzar posición con overlap
            if end_position < len(content):
                position = end_position - overlap_chars
            else:
                break
        
        return blocks
    
    def _find_natural_break(
        self, 
        content: str, 
        start: int, 
        target_end: int
    ) -> int:
        """
        Encuentra un punto de corte natural cerca del target.
        
        Prioriza:
        1. Fin de sección (## o ###)
        2. Párrafo vacío (doble newline)
        3. Fin de oración (. seguido de espacio/newline)
        
        Args:
            content: Contenido completo
            start: Posición de inicio del bloque
            target_end: Posición objetivo de fin
            
        Returns:
            Posición de corte óptima
        """
        # Rango de búsqueda: 20% antes del target
        search_range = int((target_end - start) * 0.2)
        search_start = int(max(start, target_end - search_range))
        search_region = content[search_start:int(target_end)]
        
        # Buscar header de sección (prioridad máxima)
        header_matches = list(re.finditer(r'\n##+ ', search_region))
        if header_matches:
            # Usar el último header encontrado
            return search_start + header_matches[-1].start()
        
        # Buscar párrafo vacío
        para_matches = list(re.finditer(r'\n\n', search_region))
        if para_matches:
            return search_start + para_matches[-1].end()
        
        # Buscar fin de oración
        sentence_matches = list(re.finditer(r'\.\s', search_region))
        if sentence_matches:
            return search_start + sentence_matches[-1].end()
        
        # Si no hay punto natural, usar el target
        return target_end
    
    def _create_fallback_section(
        self,
        content: str,
        document_name: str,
        section_id: str = "sec_001"
    ) -> EnrichedSection:
        """
        Crea una sección básica sin enriquecimiento LLM.
        
        Usada como fallback cuando el preprocessing falla.
        
        Args:
            content: Contenido de la sección
            document_name: Nombre del documento
            section_id: ID de la sección
            
        Returns:
            EnrichedSection con valores por defecto
        """
        # Limpiar nombre del documento para breadcrumb
        clean_name = document_name.replace('.pdf', '').replace('.docx', '').replace('_', ' ')
        
        return EnrichedSection(
            section_id=section_id,
            context_breadcrumb=f"{clean_name} → Contenido",
            content_type="mixed",
            tags=[],
            keywords=[],
            language="es",
            content_description=None,
            content=content,
            word_count=len(content.split())
        )
    
    def _renumber_sections(
        self, 
        sections: List[EnrichedSection]
    ) -> List[EnrichedSection]:
        """
        Renumera secciones para garantizar IDs únicos y secuenciales.
        
        Args:
            sections: Lista de secciones a renumerar
            
        Returns:
            Lista con secciones renumeradas
        """
        for i, section in enumerate(sections):
            section.section_id = f"sec_{i + 1:03d}"
        return sections