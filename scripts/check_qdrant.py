import asyncio
from qdrant_client import AsyncQdrantClient
import os

async def check_collections():
    qdrant_url = "http://localhost:6333"
    print(f"Connecting to Qdrant at {qdrant_url}...")
    client = AsyncQdrantClient(url=qdrant_url)
    try:
        collections = await client.get_collections()
        print("Collections found:")
        for c in collections.collections:
            print(f" - {c.name}")
        if not collections.collections:
            print(" No collections found.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(check_collections())
