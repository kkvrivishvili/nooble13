"""
Extraction Service - Servicio de extracción de documentos para Nooble8.

Este servicio se encarga de:
- Extraer texto de documentos (PDF, DOCX, TXT, HTML, Markdown) usando Docling
- Enriquecer con entidades y noun chunks usando spaCy
- Detectar estructura del documento (secciones, tablas)
- Proporcionar fallback a PyMuPDF si Docling falla

Es un servicio worker-only que escucha en Redis streams.
"""

__version__ = "1.0.0"
__author__ = "Nooble8 Team"
