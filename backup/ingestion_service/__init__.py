"""
Ingestion Service - Servicio de ingesta de documentos para Nooble8.

Este servicio se encarga de:
- Procesar documentos (PDF, DOCX, TXT, HTML, Markdown, URLs)
- Generar embeddings usando OpenAI
- Almacenar vectores en Qdrant
- Gestionar metadatos en Supabase
- Proporcionar WebSocket para seguimiento en tiempo real
"""

__version__ = "1.0.0"
__author__ = "Nooble8 Team"
