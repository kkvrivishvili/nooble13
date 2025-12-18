import asyncio
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import VectorParams, Distance, SparseVectorParams, Modifier

async def reset_collection():
    import os
    # URL (Docker internal or Localhost)
    qdrant_url = os.getenv("QDRANT_URL", "http://localhost:6333")
    client = AsyncQdrantClient(url=qdrant_url)
    collection_name = "nooble8_vectors"
    
    print(f"--- RESET COLLECTION SCRIPT ---")
    print(f"Target Collection: {collection_name}")
    print(f"Connecting to Qdrant at http://localhost:6333...")

    try:
        collections = await client.get_collections()
        exists = any(c.name == collection_name for c in collections.collections)
        
        if exists:
            print(f"Deleting existing collection '{collection_name}'...")
            await client.delete_collection(collection_name)
            print("Legacy collection deleted.")
        else:
            print("Collection did not exist. Proceeding to create.")

        # Recrear con configuración HÍBRIDA
        print("Creating new HYBRID collection (Dense + Sparse/BM25)...")
        await client.create_collection(
            collection_name=collection_name,
            vectors_config={
                "dense": VectorParams(
                    size=1536,
                    distance=Distance.COSINE
                )
            },
            sparse_vectors_config={
                "bm25": SparseVectorParams(
                    modifier=Modifier.IDF
                )
            }
        )
        print("✅ Collection created successfully!")
        print("   - Dense Vector: 'dense' (size=1536, cosine)")
        print("   - Sparse Vector: 'bm25' (IDF modifier)")
        
        # Crear índices para filtros
        indices = ["tenant_id", "collection_id", "agent_ids", "document_id"]
        print(f"Creating payload indices: {indices}...")
        for field in indices:
            await client.create_payload_index(collection_name, field, field_schema="keyword")
        print("✅ Indices created.")
        
        print("\nSUCCESS: Database is ready for Hybrid Search ingestion.")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        print("Make sure Qdrant is running (docker-compose up -d qdrant_database)")

if __name__ == "__main__":
    asyncio.run(reset_collection())
