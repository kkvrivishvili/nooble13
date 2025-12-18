import asyncio
import os
import logging
from uuid import uuid4

# Configurar logging para ver lo que pasa dentro del cliente
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_hybrid")

# Mock de settings
class MockSettings:
    def __init__(self):
        self.qdrant_url = os.getenv("QDRANT_URL", "http://qdrant_database:6333")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY", None)

async def test_search():
    print("--- STARTING HYBRID SEARCH TEST ---")
    
    # Importar el cliente (ajustar path según estructura dentro del contenedor)
    try:
        from query_service.clients.qdrant_client import QdrantClient
    except ImportError:
        import sys
        sys.path.append(os.getcwd())
        from query_service.clients.qdrant_client import QdrantClient

    settings = MockSettings()
    
    # Inicializar cliente (CORREGIDO: pasar url y api_key explícitamente)
    print(f"Connecting to Qdrant at {settings.qdrant_url}...")
    client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
    
    # IDs reales
    tenant_id = "83d848a1-8a30-4c18-b3d1-c2beb1c2ee5d"
    agent_id = "2b7191ef-56ed-4bdd-9999-6dee17f18803"
    
    query_text = "receta de platano"
    print(f"\nQuerying: '{query_text}'")
    
    # Dummy embedding (1536 dim) - Solo para satisfacer la firma.
    # La búsqueda densa fallará (dará random), pero la sparse (lexical) debería encontrar algo.
    dummy_embedding = [0.0] * 1536 

    try:
        # Ejecutar búsqueda híbrida (CORREGIDO: argumentos correctos)
        results = await client.search(
            query_embedding=dummy_embedding,
            query_text=query_text,
            collection_ids=[], # Lista vacía es válida si no hay filtro de colección
            top_k=5,
            similarity_threshold=0.0,
            tenant_id=tenant_id, # El cliente espera esto
            agent_id=agent_id
        )
        
        print(f"\n? Search completed! Found {len(results)} chunks.")
        
        if len(results) > 0:
            print(f"\nSUCCESS: Hybrid Search returned results!")
            for i, chunk in enumerate(results):
                print(f"\n[{i+1}] Score: {chunk.score}")
                print(f"    Document: {chunk.document_name}")
                print(f"    Content Start: {chunk.content[:50]}...")
        else:
            print("\nWARNING: No results found. This might be due to dummy embedding + strict RRF?")
            
    except Exception as e:
        print(f"\n? ERROR during search: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_search())
