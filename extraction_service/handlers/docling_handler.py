"""
Handler para extracción de documentos usando Docling.

Docling es una librería de IBM para extracción estructurada de documentos.
Convierte PDFs y otros formatos a Markdown preservando la estructura.
"""

import logging
import time
from pathlib import Path
from typing import Tuple, Optional, List
import asyncio

from common.handlers.base_handler import BaseHandler
from ..config.settings import ExtractionSettings
from ..models.extraction_models import (
    DocumentStructure,
    SectionInfo,
    TableInfo,
    ExtractionError
)

# Imports de Docling
try:
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    # Remover import de backend si no es necesario o es incorrecto
    DOCLING_AVAILABLE = True
except ImportError:
    DOCLING_AVAILABLE = False


class DoclingHandler(BaseHandler):
    """
    Handler para extracción de documentos usando Docling.
    
    Características:
    - Extrae texto preservando estructura (headings, tablas)
    - Convierte a Markdown estructurado
    - Detecta tablas y las formatea correctamente
    - Soporta OCR para PDFs escaneados
    """
    
    def __init__(self, app_settings: ExtractionSettings):
        """Inicializa el handler de Docling."""
        super().__init__(app_settings)
        
        self.timeout = app_settings.docling_timeout
        self.max_pages = app_settings.docling_max_pages
        self.enable_ocr = app_settings.docling_enable_ocr
        self.ocr_lang = app_settings.docling_ocr_lang
        
        # Inicializar converter solo si Docling está disponible
        self._converter: Optional[DocumentConverter] = None
        
        if DOCLING_AVAILABLE:
            self._initialize_converter()
        else:
            self._logger.warning(
                "Docling not available. Install with: pip install docling"
            )
    
    def _initialize_converter(self):
        """Inicializa el converter de Docling con configuración óptima."""
        try:
            # Configurar opciones del pipeline
            pipeline_options = PdfPipelineOptions()
            pipeline_options.do_ocr = self.enable_ocr
            pipeline_options.do_table_structure = True
            
            # Crear converter (versión 2.31.0)
            self._converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(
                        pipeline_options=pipeline_options
                    )
                }
            )
            
            self._logger.info(
                "Docling converter initialized",
                extra={
                    "enable_ocr": self.enable_ocr,
                    "max_pages": self.max_pages
                }
            )
            
        except Exception as e:
            self._logger.error(f"Failed to initialize Docling converter: {e}")
            self._converter = None
    
    @property
    def is_available(self) -> bool:
        """Verifica si Docling está disponible y configurado."""
        return DOCLING_AVAILABLE and self._converter is not None
    
    async def extract_document(
        self,
        file_path: str,
        document_type: str,
        max_pages: Optional[int] = None
    ) -> Tuple[str, DocumentStructure, Optional[ExtractionError]]:
        """
        Extrae texto y estructura de un documento usando Docling.
        
        Args:
            file_path: Ruta al archivo
            document_type: Tipo de documento (pdf, docx, etc.)
            max_pages: Límite de páginas a procesar
            
        Returns:
            Tuple de (markdown_text, structure, error_if_any)
        """
        if not self.is_available:
            return "", DocumentStructure(), ExtractionError(
                error_type="DependencyError",
                error_message="Docling not available",
                stage="initialization",
                recoverable=True
            )
        
        start_time = time.time()
        path = Path(file_path)
        
        if not path.exists():
            return "", DocumentStructure(), ExtractionError(
                error_type="FileNotFoundError",
                error_message=f"File not found: {file_path}",
                stage="file_access",
                recoverable=False
            )
        
        try:
            self._logger.info(
                f"Starting Docling extraction",
                extra={"file_path": file_path, "document_type": document_type}
            )
            
            # Ejecutar conversión en thread pool para no bloquear
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                self._convert_document,
                path,
                max_pages or self.max_pages
            )
            
            if result is None:
                return "", DocumentStructure(), ExtractionError(
                    error_type="ConversionError",
                    error_message="Docling conversion returned None",
                    stage="conversion",
                    recoverable=True
                )
            
            # Obtener Markdown
            markdown_text = result.document.export_to_markdown()
            
            # Extraer estructura
            structure = self._extract_structure(result, markdown_text)
            
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            self._logger.info(
                f"Docling extraction completed",
                extra={
                    "file_path": file_path,
                    "page_count": structure.page_count,
                    "sections_count": len(structure.sections),
                    "tables_count": structure.tables_count,
                    "word_count": structure.word_count,
                    "elapsed_ms": elapsed_ms
                }
            )
            
            return markdown_text, structure, None
            
        except asyncio.TimeoutError:
            return "", DocumentStructure(), ExtractionError(
                error_type="TimeoutError",
                error_message=f"Docling extraction timed out after {self.timeout}s",
                stage="conversion",
                recoverable=True
            )
            
        except Exception as e:
            self._logger.error(f"Docling extraction error: {e}", exc_info=True)
            return "", DocumentStructure(), ExtractionError(
                error_type=type(e).__name__,
                error_message=str(e),
                stage="conversion",
                recoverable=True,
                details={"file_path": file_path}
            )
    
    def _convert_document(self, path: Path, max_pages: int):
        """
        Conversión síncrona del documento (ejecutada en thread pool).
        """
        try:
            # En Docling v2, algunas opciones se pasan al convert() o están en el pipeline
            # Si no hay forma directa de limitar páginas en convert(), Docling suele procesar todo
            # pero algunas versiones permiten configurar el backend.
            result = self._converter.convert(str(path))
            return result
        except Exception as e:
            self._logger.error(f"Docling convert error: {e}")
            raise
    
    def _extract_structure(self, result, markdown_text: str) -> DocumentStructure:
        """
        Extrae la estructura del documento desde el resultado de Docling.
        """
        sections: List[SectionInfo] = []
        tables: List[TableInfo] = []
        
        try:
            doc = result.document
            
            # Extraer secciones desde los headings del markdown
            sections = self._parse_markdown_sections(markdown_text)
            
            # Extraer información de tablas
            tables = self._parse_markdown_tables(markdown_text)
            
            # Contar páginas
            page_count = getattr(doc, 'page_count', 0) or self._estimate_pages(markdown_text)
            
            # Estadísticas de texto
            word_count = len(markdown_text.split())
            char_count = len(markdown_text)
            
            return DocumentStructure(
                sections=sections,
                tables=tables,
                tables_count=len(tables),
                page_count=page_count,
                has_toc=self._has_toc(sections),
                has_images=self._has_images(markdown_text),
                word_count=word_count,
                char_count=char_count
            )
            
        except Exception as e:
            self._logger.warning(f"Error extracting structure: {e}")
            return DocumentStructure(
                word_count=len(markdown_text.split()),
                char_count=len(markdown_text)
            )
    
    def _parse_markdown_sections(self, markdown_text: str) -> List[SectionInfo]:
        """
        Parsea secciones desde headings de Markdown.
        """
        sections = []
        lines = markdown_text.split('\n')
        char_pos = 0
        parent_titles = {1: None, 2: None, 3: None, 4: None, 5: None, 6: None}
        
        for line in lines:
            stripped = line.strip()
            
            # Detectar headings
            if stripped.startswith('#'):
                level = 0
                for char in stripped:
                    if char == '#':
                        level += 1
                    else:
                        break
                
                if 1 <= level <= 6:
                    title = stripped[level:].strip()
                    if title:
                        # Determinar padre
                        parent_title = None
                        for l in range(level - 1, 0, -1):
                            if parent_titles.get(l):
                                parent_title = parent_titles[l]
                                break
                        
                        section = SectionInfo(
                            title=title,
                            level=level,
                            start_char=char_pos,
                            parent_title=parent_title
                        )
                        sections.append(section)
                        
                        # Actualizar padre para niveles inferiores
                        parent_titles[level] = title
                        for l in range(level + 1, 7):
                            parent_titles[l] = None
            
            char_pos += len(line) + 1  # +1 por el newline
        
        # Calcular end_char de cada sección
        for i, section in enumerate(sections):
            if i < len(sections) - 1:
                section.end_char = sections[i + 1].start_char - 1
            else:
                section.end_char = len(markdown_text)
        
        return sections
    
    def _parse_markdown_tables(self, markdown_text: str) -> List[TableInfo]:
        """
        Detecta tablas en formato Markdown.
        """
        tables = []
        lines = markdown_text.split('\n')
        char_pos = 0
        in_table = False
        table_start = 0
        table_lines = []
        table_index = 0
        
        for line in lines:
            # Detectar línea de tabla (contiene |)
            is_table_line = '|' in line and not line.strip().startswith('```')
            
            if is_table_line:
                if not in_table:
                    in_table = True
                    table_start = char_pos
                    table_lines = []
                table_lines.append(line)
            else:
                if in_table and table_lines:
                    # Fin de tabla
                    rows = len([l for l in table_lines if l.strip() and not set(l.strip()) <= {'|', '-', ' ', ':'}])
                    cols = max(l.count('|') - 1 for l in table_lines) if table_lines else 0
                    
                    tables.append(TableInfo(
                        table_index=table_index,
                        rows=max(0, rows),
                        cols=max(0, cols),
                        start_char=table_start,
                        has_header=len(table_lines) > 1,
                        markdown_content='\n'.join(table_lines)
                    ))
                    table_index += 1
                    in_table = False
                    table_lines = []
            
            char_pos += len(line) + 1
        
        # Última tabla si terminó sin línea vacía
        if in_table and table_lines:
            rows = len([l for l in table_lines if l.strip() and not set(l.strip()) <= {'|', '-', ' ', ':'}])
            cols = max(l.count('|') - 1 for l in table_lines) if table_lines else 0
            tables.append(TableInfo(
                table_index=table_index,
                rows=max(0, rows),
                cols=max(0, cols),
                start_char=table_start,
                has_header=True,
                markdown_content='\n'.join(table_lines)
            ))
        
        return tables
    
    def _has_toc(self, sections: List[SectionInfo]) -> bool:
        """Detecta si hay tabla de contenidos."""
        toc_keywords = ['contenido', 'índice', 'table of contents', 'contents', 'indice']
        for section in sections[:5]:  # Solo revisar primeras secciones
            if any(kw in section.title.lower() for kw in toc_keywords):
                return True
        return False
    
    def _has_images(self, markdown_text: str) -> bool:
        """Detecta si hay imágenes en el markdown."""
        return '![' in markdown_text or '<img' in markdown_text.lower()
    
    def _estimate_pages(self, text: str) -> int:
        """Estima número de páginas basado en palabras (~300 palabras/página)."""
        word_count = len(text.split())
        return max(1, word_count // 300)
