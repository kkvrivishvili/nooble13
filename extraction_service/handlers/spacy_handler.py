"""
Handler para enriquecimiento de documentos usando spaCy.

Extrae:
- Entidades nombradas (PERSON, ORG, DATE, MONEY, etc.)
- Noun chunks (sustantivos compuestos) - clave para búsqueda agnóstica
- Lemmas para mejorar BM25
- Detección de idioma
"""

import logging
import time
from typing import List, Dict, Optional, Tuple
import asyncio

from common.handlers.base_handler import BaseHandler
from ..config.settings import ExtractionSettings
from ..models.extraction_models import (
    SpacyEnrichment,
    EntityInfo,
    SpacyModelSize,
    ExtractionError
)

# Imports de spaCy
try:
    import spacy
    from spacy.tokens import Doc
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False

# Detección de idioma
try:
    from langdetect import detect, detect_langs
    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False


class SpacyHandler(BaseHandler):
    """
    Handler para enriquecimiento NLP usando spaCy.
    
    Características clave:
    - Noun Chunks: Extrae sustantivos compuestos agnósticamente
      ("válvula de presión", "cláusula de rescisión")
    - Entidades: PERSON, ORG, DATE, MONEY, LOC, etc.
    - Lemmas: Raíces de palabras para mejorar BM25
    - Soporte multiidioma (español/inglés)
    - Modelos md/lg según tier de suscripción
    """
    
    # Mapeo de modelos por idioma y tamaño
    MODEL_MAP = {
        "es": {
            SpacyModelSize.MEDIUM: "es_core_news_md",
            SpacyModelSize.LARGE: "es_core_news_lg"
        },
        "en": {
            SpacyModelSize.MEDIUM: "en_core_web_md",
            SpacyModelSize.LARGE: "en_core_web_lg"
        }
    }
    
    def __init__(self, app_settings: ExtractionSettings):
        """Inicializa el handler de spaCy."""
        super().__init__(app_settings)
        
        self.max_text_length = app_settings.spacy_max_text_length
        self.batch_size = app_settings.spacy_batch_size
        self.default_language = app_settings.default_language
        self.supported_languages = app_settings.supported_languages
        
        # Cache de modelos cargados
        self._loaded_models: Dict[str, spacy.Language] = {}
        
        if not SPACY_AVAILABLE:
            self._logger.warning(
                "spaCy not available. Install with: pip install spacy"
            )
    
    @property
    def is_available(self) -> bool:
        """Verifica si spaCy está disponible."""
        return SPACY_AVAILABLE
    
    def get_model_name(self, language: str, size: SpacyModelSize) -> str:
        """Obtiene el nombre del modelo según idioma y tamaño."""
        lang = language if language in self.MODEL_MAP else self.default_language
        return self.MODEL_MAP[lang][size]
    
    def _load_model(self, model_name: str) -> Optional[spacy.Language]:
        """Carga un modelo spaCy con cache."""
        if model_name in self._loaded_models:
            return self._loaded_models[model_name]
        
        try:
            self._logger.info(f"Loading spaCy model: {model_name}")
            start = time.time()
            
            nlp = spacy.load(model_name)
            
            # Configurar pipeline para eficiencia
            # Desactivar componentes no necesarios si existen
            disable_components = []
            for comp in ['parser', 'textcat', 'tagger']:
                if comp in nlp.pipe_names and comp != 'ner':
                    disable_components.append(comp)
            
            if disable_components:
                self._logger.debug(f"Disabling components: {disable_components}")
                for comp in disable_components:
                    nlp.disable_pipe(comp)
            
            # Aumentar límite de texto
            nlp.max_length = self.max_text_length
            
            self._loaded_models[model_name] = nlp
            
            elapsed = time.time() - start
            self._logger.info(
                f"spaCy model loaded: {model_name} ({elapsed:.2f}s)"
            )
            
            return nlp
            
        except OSError as e:
            self._logger.error(f"Model not found: {model_name}. Error: {e}")
            return None
        except Exception as e:
            self._logger.error(f"Error loading model {model_name}: {e}")
            return None
    
    def detect_language(self, text: str) -> Tuple[str, float]:
        """
        Detecta el idioma del texto.
        
        Returns:
            Tuple de (código_idioma, confianza)
        """
        if not LANGDETECT_AVAILABLE or not text.strip():
            return self.default_language, 0.0
        
        try:
            # Usar muestra del texto para detección rápida
            sample = text[:5000] if len(text) > 5000 else text
            
            langs = detect_langs(sample)
            if langs:
                top_lang = langs[0]
                lang_code = top_lang.lang
                confidence = top_lang.prob
                
                # Mapear a idiomas soportados
                if lang_code not in self.supported_languages:
                    lang_code = self.default_language
                
                return lang_code, confidence
                
        except Exception as e:
            self._logger.warning(f"Language detection failed: {e}")
        
        return self.default_language, 0.5
    
    async def enrich_text(
        self,
        text: str,
        model_size: SpacyModelSize = SpacyModelSize.MEDIUM,
        language: Optional[str] = None
    ) -> Tuple[SpacyEnrichment, Optional[ExtractionError]]:
        """
        Enriquece un texto con spaCy.
        
        Args:
            text: Texto a enriquecer
            model_size: Tamaño del modelo (md/lg)
            language: Idioma (si None, se detecta automáticamente)
            
        Returns:
            Tuple de (SpacyEnrichment, error_if_any)
        """
        if not self.is_available:
            return SpacyEnrichment(), ExtractionError(
                error_type="DependencyError",
                error_message="spaCy not available",
                stage="initialization",
                recoverable=False
            )
        
        if not text.strip():
            return SpacyEnrichment(), None
        
        start_time = time.time()
        
        try:
            # Detectar idioma si no se especifica
            if language is None:
                language, lang_confidence = self.detect_language(text)
            else:
                lang_confidence = 1.0
            
            # Obtener modelo
            model_name = self.get_model_name(language, model_size)
            nlp = self._load_model(model_name)
            
            if nlp is None:
                # Intentar fallback a modelo medium si large no está
                if model_size == SpacyModelSize.LARGE:
                    model_name = self.get_model_name(language, SpacyModelSize.MEDIUM)
                    nlp = self._load_model(model_name)
                
                if nlp is None:
                    return SpacyEnrichment(language=language), ExtractionError(
                        error_type="ModelNotFoundError",
                        error_message=f"Could not load spaCy model for {language}",
                        stage="model_loading",
                        recoverable=False
                    )
            
            # Truncar texto si es muy largo
            if len(text) > self.max_text_length:
                self._logger.warning(
                    f"Text truncated from {len(text)} to {self.max_text_length} chars"
                )
                text = text[:self.max_text_length]
            
            # Procesar en thread pool para no bloquear
            loop = asyncio.get_event_loop()
            doc = await loop.run_in_executor(None, nlp, text)
            
            # Extraer entidades
            entities = self._extract_entities(doc)
            
            # Extraer noun chunks (clave para búsqueda agnóstica)
            noun_chunks = self._extract_noun_chunks(doc)
            
            # Agrupar entidades por tipo
            entities_by_type = self._group_entities_by_type(entities)
            
            # Extraer lemmas únicos (para BM25)
            unique_lemmas = self._extract_unique_lemmas(doc)
            
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            enrichment = SpacyEnrichment(
                entities=entities,
                noun_chunks=noun_chunks,
                language=language,
                language_confidence=lang_confidence,
                entities_by_type=entities_by_type,
                unique_lemmas=unique_lemmas,
                entity_count=len(entities),
                noun_chunk_count=len(noun_chunks)
            )
            
            self._logger.info(
                f"spaCy enrichment completed",
                extra={
                    "model": model_name,
                    "language": language,
                    "entities_count": len(entities),
                    "noun_chunks_count": len(noun_chunks),
                    "lemmas_count": len(unique_lemmas),
                    "elapsed_ms": elapsed_ms
                }
            )
            
            return enrichment, None
            
        except Exception as e:
            self._logger.error(f"spaCy enrichment error: {e}", exc_info=True)
            return SpacyEnrichment(language=language or self.default_language), ExtractionError(
                error_type=type(e).__name__,
                error_message=str(e),
                stage="enrichment",
                recoverable=False
            )
    
    def _extract_entities(self, doc: 'Doc') -> List[EntityInfo]:
        """
        Extrae entidades nombradas del documento.
        
        Tipos comunes:
        - PERSON: Personas
        - ORG: Organizaciones
        - DATE: Fechas
        - MONEY: Cantidades monetarias
        - LOC: Ubicaciones
        - GPE: Entidades geopolíticas
        """
        entities = []
        seen = set()  # Para evitar duplicados
        
        for ent in doc.ents:
            # Evitar duplicados (mismo texto y label)
            key = (ent.text.lower(), ent.label_)
            if key in seen:
                continue
            seen.add(key)
            
            # Filtrar entidades muy cortas o ruidosas
            if len(ent.text.strip()) < 2:
                continue
            
            entities.append(EntityInfo(
                text=ent.text.strip(),
                label=ent.label_,
                start_char=ent.start_char,
                end_char=ent.end_char,
                confidence=None  # spaCy no da confidence nativo
            ))
        
        return entities
    
    def _extract_noun_chunks(self, doc: 'Doc') -> List[str]:
        """
        Extrae noun chunks (sustantivos compuestos).
        
        Este es el secreto para búsqueda agnóstica:
        - "válvula de presión" en manual técnico
        - "cláusula de rescisión" en contrato legal
        - "mousse de chocolate" en receta
        
        Se capturan automáticamente sin diccionarios de dominio.
        """
        noun_chunks = []
        seen = set()
        
        for chunk in doc.noun_chunks:
            # Limpiar y normalizar
            text = chunk.text.strip().lower()
            
            # Filtrar chunks muy cortos o muy largos
            if len(text) < 3 or len(text) > 100:
                continue
            
            # Filtrar chunks que son solo stopwords o números
            if chunk.root.is_stop or chunk.root.like_num:
                continue
            
            # Evitar duplicados
            if text in seen:
                continue
            seen.add(text)
            
            noun_chunks.append(chunk.text.strip())
        
        return noun_chunks
    
    def _group_entities_by_type(
        self, 
        entities: List[EntityInfo]
    ) -> Dict[str, List[str]]:
        """Agrupa entidades por tipo para búsqueda rápida."""
        groups: Dict[str, List[str]] = {}
        
        for entity in entities:
            if entity.label not in groups:
                groups[entity.label] = []
            
            # Evitar duplicados dentro del grupo
            if entity.text not in groups[entity.label]:
                groups[entity.label].append(entity.text)
        
        return groups
    
    def _extract_unique_lemmas(self, doc: 'Doc') -> List[str]:
        """
        Extrae lemmas únicos para mejorar BM25.
        
        Lemmatización: "corriendo" → "correr", "libros" → "libro"
        Mejora recall en búsquedas porque matchea variaciones.
        """
        lemmas = set()
        
        for token in doc:
            # Filtrar stopwords, puntuación y espacios
            if token.is_stop or token.is_punct or token.is_space:
                continue
            
            # Filtrar tokens muy cortos
            if len(token.lemma_) < 3:
                continue
            
            # Solo incluir sustantivos, verbos, adjetivos
            if token.pos_ in ('NOUN', 'VERB', 'ADJ', 'PROPN'):
                lemmas.add(token.lemma_.lower())
        
        return list(lemmas)
    
    def unload_model(self, model_name: str):
        """Descarga un modelo para liberar memoria."""
        if model_name in self._loaded_models:
            del self._loaded_models[model_name]
            self._logger.info(f"Model unloaded: {model_name}")
    
    def unload_all_models(self):
        """Descarga todos los modelos."""
        self._loaded_models.clear()
        self._logger.info("All spaCy models unloaded")
