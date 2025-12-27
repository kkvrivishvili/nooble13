"""
Servicio principal de extracción de documentos.

Coordina:
1. Docling para extracción estructurada
2. Fallback a PyMuPDF si Docling falla
3. spaCy para enriquecimiento NLP
"""

import logging
import time
import os
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

from common.services.base_service import BaseService
from common.models.actions import DomainAction

from ..config.settings import ExtractionSettings
from ..handlers import DoclingHandler, SpacyHandler, FallbackHandler
from ..models.extraction_models import (
    ExtractionRequest,
    ExtractionResult,
    ExtractionStatus,
    ExtractionError,
    ProcessingMode,
    SpacyModelSize,
    DocumentStructure,
    SpacyEnrichment
)

logger = logging.getLogger(__name__)


class ExtractionService(BaseService):
    """
    Servicio principal de extracción de documentos.
    
    Pipeline:
    1. Recibe DomainAction con ExtractionRequest
    2. Intenta extracción con Docling
    3. Si falla, usa fallback (PyMuPDF)
    4. Enriquece con spaCy según tier
    5. Envía callback a ingestion-service
    """
    
    def __init__(
        self,
        app_settings: ExtractionSettings,
        service_redis_client=None,
        direct_redis_conn=None
    ):
        """Inicializa el servicio de extracción."""
        super().__init__(app_settings, service_redis_client, direct_redis_conn)
        
        # Inicializar handlers
        self.docling_handler: Optional[DoclingHandler] = None
        self.spacy_handler: Optional[SpacyHandler] = None
        self.fallback_handler: Optional[FallbackHandler] = None
        
        # Configuración
        self.enable_fallback = app_settings.enable_fallback
        self.cleanup_temp_files = app_settings.cleanup_temp_files
        self.temp_dir = Path(app_settings.temp_dir)
    
    async def initialize(self):
        """Inicializa handlers del servicio."""
        self._logger.info("Initializing ExtractionService...")
        
        # Crear directorio temporal si no existe
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        
        # Inicializar Docling handler
        self.docling_handler = DoclingHandler(self.app_settings)
        
        # Inicializar spaCy handler
        self.spacy_handler = SpacyHandler(self.app_settings)
        
        # Inicializar fallback handler
        self.fallback_handler = FallbackHandler(self.app_settings)
        
        self._logger.info(
            "ExtractionService initialized",
            extra={
                "docling_available": self.docling_handler.is_available,
                "spacy_available": self.spacy_handler.is_available,
                "fallback_available": self.fallback_handler.is_available
            }
        )
    
    async def process_action(self, action: DomainAction) -> Optional[Dict[str, Any]]:
        """
        Procesa una DomainAction de extracción.
        
        Tipos de acciones soportadas:
        - extraction.document.process: Extraer documento
        """
        action_type = action.action_type
        
        self._logger.info(
            f"Processing action: {action_type}",
            extra=action.get_log_extra()
        )
        
        if action_type == "extraction.document.process":
            return await self._handle_extraction(action)
        else:
            self._logger.warning(f"Unknown action type: {action_type}")
            return None
    
    async def _handle_extraction(self, action: DomainAction) -> Dict[str, Any]:
        """
        Maneja la extracción de un documento.
        
        Retorna datos para el callback a ingestion-service.
        """
        start_time = time.time()
        
        # Parsear request
        try:
            request = ExtractionRequest(**action.data)
        except Exception as e:
            self._logger.error(f"Invalid extraction request: {e}")
            return self._create_error_result(
                action.data.get("task_id", "unknown"),
                action.data.get("document_id", "unknown"),
                str(action.tenant_id),
                ExtractionError(
                    error_type="ValidationError",
                    error_message=str(e),
                    stage="request_parsing",
                    recoverable=False
                )
            )
        
        self._logger.info(
            f"Starting extraction",
            extra={
                "task_id": request.task_id,
                "document_id": request.document_id,
                "document_type": request.document_type,
                "document_name": request.document_name,
                "processing_mode": request.processing_mode.value
            }
        )
        
        extracted_text = ""
        structure = DocumentStructure()
        extraction_method = "unknown"
        extraction_time_ms = 0
        
        # ================================================================
        # PASO 1: Extracción con Docling
        # ================================================================
        extraction_start = time.time()
        
        if self.docling_handler and self.docling_handler.is_available:
            self._logger.info("Attempting Docling extraction...")
            
            text, doc_structure, error = await self.docling_handler.extract_document(
                file_path=request.file_path,
                document_type=request.document_type,
                max_pages=request.max_pages
            )
            
            if error is None and text.strip():
                extracted_text = text
                structure = doc_structure
                extraction_method = "docling"
                self._logger.info(
                    "Docling extraction successful",
                    extra={
                        "word_count": structure.word_count,
                        "page_count": structure.page_count,
                        "sections_count": len(structure.sections)
                    }
                )
            elif error and error.recoverable and self.enable_fallback:
                self._logger.warning(
                    f"Docling failed ({error.error_message}), trying fallback..."
                )
            else:
                self._logger.error(f"Docling failed: {error}")
        
        # ================================================================
        # PASO 2: Fallback si Docling falló
        # ================================================================
        if not extracted_text.strip() and self.enable_fallback and self.fallback_handler:
            self._logger.info("Attempting fallback extraction...")
            
            text, doc_structure, error = await self.fallback_handler.extract_document(
                file_path=request.file_path,
                document_type=request.document_type,
                max_pages=request.max_pages
            )
            
            if error is None and text.strip():
                extracted_text = text
                structure = doc_structure
                extraction_method = "fallback_pymupdf"
                self._logger.info(
                    "Fallback extraction successful",
                    extra={"word_count": structure.word_count}
                )
            elif error:
                self._logger.error(f"Fallback also failed: {error}")
                return self._create_error_result(
                    request.task_id,
                    request.document_id,
                    request.tenant_id,
                    error
                )
        
        extraction_time_ms = int((time.time() - extraction_start) * 1000)
        
        # Verificar que tenemos texto
        if not extracted_text.strip():
            return self._create_error_result(
                request.task_id,
                request.document_id,
                request.tenant_id,
                ExtractionError(
                    error_type="EmptyDocumentError",
                    error_message="Document is empty or could not be extracted",
                    stage="extraction",
                    recoverable=False
                )
            )
        
        # ================================================================
        # PASO 3: Enriquecimiento con spaCy
        # ================================================================
        spacy_start = time.time()
        spacy_enrichment = SpacyEnrichment()
        spacy_model_used = "none"
        
        if self.spacy_handler and self.spacy_handler.is_available:
            # Determinar modelo según tier
            model_size = self._get_spacy_model_size(request.processing_mode, request.spacy_model_size)
            
            self._logger.info(
                f"Starting spaCy enrichment with model size: {model_size.value}"
            )
            
            enrichment, spacy_error = await self.spacy_handler.enrich_text(
                text=extracted_text,
                model_size=model_size
            )
            
            if spacy_error is None:
                spacy_enrichment = enrichment
                spacy_model_used = self.spacy_handler._get_model_name(
                    enrichment.language, model_size
                )
                
                self._logger.info(
                    "spaCy enrichment completed",
                    extra={
                        "entities_count": enrichment.entity_count,
                        "noun_chunks_count": enrichment.noun_chunk_count,
                        "language": enrichment.language
                    }
                )
            else:
                self._logger.warning(f"spaCy enrichment failed: {spacy_error}")
        
        spacy_time_ms = int((time.time() - spacy_start) * 1000)
        
        # ================================================================
        # PASO 4: Construir resultado
        # ================================================================
        total_time_ms = int((time.time() - start_time) * 1000)
        
        result = ExtractionResult(
            task_id=request.task_id,
            document_id=request.document_id,
            tenant_id=request.tenant_id,
            status=ExtractionStatus.COMPLETED,
            extracted_text=extracted_text,
            structure=structure,
            spacy_enrichment=spacy_enrichment,
            extraction_method=extraction_method,
            processing_mode=request.processing_mode,
            spacy_model_used=spacy_model_used,
            extraction_time_ms=extraction_time_ms,
            spacy_time_ms=spacy_time_ms,
            total_time_ms=total_time_ms
        )
        
        # Limpiar archivo temporal si está configurado
        if self.cleanup_temp_files:
            self._cleanup_file(request.file_path)
        
        self._logger.info(
            "Extraction completed successfully",
            extra={
                "task_id": request.task_id,
                "document_id": request.document_id,
                "extraction_method": extraction_method,
                "word_count": structure.word_count,
                "entities_count": spacy_enrichment.entity_count,
                "noun_chunks_count": spacy_enrichment.noun_chunk_count,
                "total_time_ms": total_time_ms
            }
        )
        
        return result.model_dump(mode='json')
    
    def _get_spacy_model_size(
        self,
        processing_mode: ProcessingMode,
        requested_size: SpacyModelSize
    ) -> SpacyModelSize:
        """
        Determina el tamaño del modelo spaCy según el tier y request.
        
        - FAST: Siempre md (free tier)
        - BALANCED/PREMIUM: lg si está disponible
        """
        if processing_mode == ProcessingMode.FAST:
            return SpacyModelSize.MEDIUM
        
        # Para balanced/premium, usar lo solicitado o lg por defecto
        return requested_size if requested_size else SpacyModelSize.LARGE
    
    def _create_error_result(
        self,
        task_id: str,
        document_id: str,
        tenant_id: str,
        error: ExtractionError
    ) -> Dict[str, Any]:
        """Crea un resultado de error."""
        result = ExtractionResult(
            task_id=task_id,
            document_id=document_id,
            tenant_id=tenant_id,
            status=ExtractionStatus.FAILED,
            error=error
        )
        return result.model_dump(mode='json')
    
    def _cleanup_file(self, file_path: str):
        """Elimina archivo temporal."""
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
                self._logger.debug(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            self._logger.warning(f"Failed to cleanup temp file {file_path}: {e}")
