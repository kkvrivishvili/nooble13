"""
Cliente para Qdrant usando el SDK oficial.
"""
import logging
from typing import List, Optional, Dict, Any
from uuid import UUID

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Filter, FieldCondition, MatchValue, MatchAny,
    SearchParams, PointStruct
)

from common.models.chat_models import RAGChunk


class QdrantClient:
    """Cliente oficial de Qdrant para búsquedas vectoriales."""
    
    def __init__(self, url: str, api_key: Optional[str] = None, collection_name: str = "nooble8_vectors"):
        """
        Inicializa el cliente de Qdrant.
        
        Args:
            url: URL de Qdrant
            api_key: API key opcional
            collection_name: Nombre de la colección física en Qdrant
        """
        self.client = AsyncQdrantClient(
            url=url,
            api_key=api_key,
            timeout=30
        )
        self.logger = logging.getLogger(__name__)
        self.collection_name = collection_name
    
    async def search(
        self,
        query_embedding: List[float],
        collection_ids: List[str],
        top_k: int,
        similarity_threshold: float,
        tenant_id: UUID,
        agent_id: str,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[RAGChunk]:
        """
        Realiza búsqueda vectorial en la colección unificada "documents".
        
        Args:
            agent_id: ID del agente - OBLIGATORIO para filtrado
            collection_ids: IDs de colecciones para filtro virtual (no nombres físicos)
        
        Returns:
            Lista de RAGChunk directamente
        """
        # LOG DETALLADO: Parámetros de entrada
        self.logger.info(
            f"QdrantClient: SEARCH ejecutándose - collection_ids={collection_ids}, tenant_id={tenant_id}, agent_id={agent_id}, top_k={top_k}, threshold={similarity_threshold}"
        )
        
        # Validar agent_id obligatorio
        if not agent_id:
            raise ValueError("agent_id is required for vector search")
        
        # Construir filtro con tenant_id, agent_id Y collection_ids virtuales
        must_conditions = [
            FieldCondition(
                key="tenant_id",
                match=MatchValue(value=str(tenant_id))
            ),
            # Filtro obligatorio por agent_id (array contiene el agente)
            FieldCondition(
                key="agent_ids",
                match=MatchAny(any=[str(agent_id)])
            )
        ]
        
        # Filtrar por collection_ids virtuales si se proporcionan
        if collection_ids:
            must_conditions.append(
                FieldCondition(
                    key="collection_id",
                    match=MatchAny(any=[str(c) for c in collection_ids])
                )
            )
        
        # Agregar filtros adicionales si existen
        if filters and filters.get("document_ids"):
            must_conditions.append(
                FieldCondition(
                    key="document_id",
                    match=MatchAny(any=[str(d) for d in filters["document_ids"]])
                )
            )
        
        qdrant_filter = Filter(must=must_conditions)
        
        # LOG DETALLADO: Filtros construidos
        try:
            filter_debug = []
            for i, cond in enumerate(must_conditions):
                try:
                    match = getattr(cond, "match", None)
                    condition_info = {
                        "condition_index": i,
                        "key": getattr(cond, "key", None),
                        "match_type": match.__class__.__name__ if match else None,
                    }
                    
                    if hasattr(match, "value"):
                        condition_info["value"] = getattr(match, "value")
                    if hasattr(match, "any"):
                        condition_info["any"] = getattr(match, "any")
                        condition_info["any_count"] = len(getattr(match, "any")) if getattr(match, "any") else 0
                    
                    filter_debug.append(condition_info)
                except Exception as e:
                    filter_debug.append({
                        "condition_index": i,
                        "key": getattr(cond, "key", "unknown"), 
                        "error": str(e)
                    })
            
            self.logger.info(
                f"[SEARCH] Filtros Qdrant construidos",
                extra={
                    "filter_conditions_count": len(must_conditions),
                    "filter_conditions": filter_debug,
                    "search_params": {
                        "top_k": top_k,
                        "similarity_threshold": similarity_threshold,
                        "collection_name": self.collection_name
                    }
                }
            )
        except Exception as e:
            self.logger.warning(f"[SEARCH] Error serializando filtros para log: {e}")
        
        # Buscar en la colección configurada (p.ej. "nooble8_vectors")
        self.logger.info(f"[SEARCH] Ejecutando búsqueda en Qdrant...")
        
        results = await self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=qdrant_filter,
            limit=top_k,
            score_threshold=similarity_threshold,
            with_payload=True
        )
        
        # LOG DETALLADO: Resultados de búsqueda
        self.logger.info(
            f"[SEARCH] Búsqueda ejecutada",
            extra={
                "results_count": len(results),
                "requested_top_k": top_k,
                "similarity_threshold": similarity_threshold,
                "results_scores": [r.score for r in results[:5]] if results else [],  # Primeros 5 scores
                "results_ids_sample": [str(r.id) for r in results[:3]] if results else []  # Primeros 3 IDs
            }
        )
        
        # LOG ADICIONAL: Analizar payloads de los primeros resultados
        if results:
            for i, result in enumerate(results[:2]):  # Solo los primeros 2 para no saturar logs
                try:
                    payload = result.payload or {}
                    self.logger.info(
                        f"[SEARCH] Resultado {i+1} payload",
                        extra={
                            "result_index": i+1,
                            "result_id": str(result.id),
                            "result_score": result.score,
                            "payload_tenant_id": payload.get("tenant_id"),
                            "payload_collection_id": payload.get("collection_id"),
                            "payload_agent_ids": payload.get("agent_ids"),
                            "payload_document_id": payload.get("document_id"),
                            "payload_content_length": len(payload.get("content", ""))
                        }
                    )
                except Exception as e:
                    self.logger.warning(f"[SEARCH] Error analizando payload del resultado {i+1}: {e}")
        
        # DIAGNÓSTICO DETALLADO: si no hay resultados, investigar por qué
        if not results:
            self.logger.warning(
                f"[SEARCH] Sin resultados - iniciando diagnóstico",
                extra={
                    "tenant_id": str(tenant_id),
                    "agent_id": str(agent_id),
                    "collection_ids": collection_ids,
                    "similarity_threshold": similarity_threshold
                }
            )
            
            try:
                # 1. Verificar si existen puntos para este tenant
                scroll_points, _ = await self.client.scroll(
                    collection_name=self.collection_name,
                    scroll_filter=Filter(must=[
                        FieldCondition(
                            key="tenant_id",
                            match=MatchValue(value=str(tenant_id))
                        )
                    ]),
                    limit=5,
                    with_payload=True
                )
                
                if not scroll_points:
                    self.logger.error(
                        f"[DIAG] PROBLEMA: No hay puntos para tenant_id={tenant_id}",
                        extra={
                            "collection_name": self.collection_name,
                            "tenant_id": str(tenant_id)
                        }
                    )
                else:
                    # Analizar los puntos encontrados
                    examples = []
                    agent_ids_found = set()
                    collection_ids_found = set()
                    
                    for p in scroll_points:
                        payload = p.payload or {}
                        point_agent_ids = payload.get("agent_ids", [])
                        point_collection_id = payload.get("collection_id")
                        
                        examples.append({
                            "id": str(p.id),
                            "collection_id": point_collection_id,
                            "agent_ids": point_agent_ids,
                            "document_id": payload.get("document_id"),
                        })
                        
                        # Recopilar IDs únicos
                        if isinstance(point_agent_ids, list):
                            agent_ids_found.update(point_agent_ids)
                        if point_collection_id:
                            collection_ids_found.add(point_collection_id)
                    
                    self.logger.info(
                        f"QdrantClient: Encontrados {len(scroll_points)} puntos para tenant_id={tenant_id}"
                    )
                    self.logger.info(
                        f"QdrantClient: Collection IDs en datos = {list(collection_ids_found)}"
                    )
                    self.logger.info(
                        f"QdrantClient: Collection IDs buscados = {collection_ids}"
                    )
                    self.logger.info(
                        f"QdrantClient: Agent IDs en datos = {list(agent_ids_found)}"
                    )
                    self.logger.info(
                        f"QdrantClient: Agent ID buscado = {agent_id}"
                    )
                    
                    # 2. Verificar filtro por agent_id específicamente
                    if str(agent_id) not in agent_ids_found:
                        self.logger.error(
                            f"[DIAG] PROBLEMA: agent_id '{agent_id}' no encontrado en los datos",
                            extra={
                                "search_agent_id": str(agent_id),
                                "available_agent_ids": list(agent_ids_found)
                            }
                        )
                    
                    # 3. Verificar filtro por collection_ids
                    if collection_ids and not any(cid in collection_ids_found for cid in collection_ids):
                        self.logger.error(
                            f"[DIAG] PROBLEMA: Ninguna collection_id coincide",
                            extra={
                                "search_collection_ids": collection_ids,
                                "available_collection_ids": list(collection_ids_found)
                            }
                        )
                # 4. Fallback: ejecutar búsqueda sin score_threshold para analizar scores
                self.logger.info(f"[DIAG] Ejecutando búsqueda fallback sin threshold...")
                
                fallback_results = await self.client.search(
                    collection_name=self.collection_name,
                    query_vector=query_embedding,
                    query_filter=qdrant_filter,
                    limit=min(10, max(1, top_k * 2)),  # Más resultados para análisis
                    with_payload=True
                )
                
                if fallback_results:
                    diag_scores = []
                    above_threshold = 0
                    below_threshold = 0
                    
                    for r in fallback_results:
                        score_info = {
                            "id": str(r.id),
                            "score": r.score,
                            "above_threshold": r.score >= similarity_threshold,
                            "collection_id": (r.payload or {}).get("collection_id"),
                            "agent_ids": (r.payload or {}).get("agent_ids"),
                        }
                        diag_scores.append(score_info)
                        
                        if r.score >= similarity_threshold:
                            above_threshold += 1
                        else:
                            below_threshold += 1
                    
                    self.logger.info(
                        f"[DIAG] Búsqueda fallback encontró {len(fallback_results)} resultados",
                        extra={
                            "fallback_results_count": len(fallback_results),
                            "above_threshold_count": above_threshold,
                            "below_threshold_count": below_threshold,
                            "similarity_threshold": similarity_threshold,
                            "max_score": max(r.score for r in fallback_results),
                            "min_score": min(r.score for r in fallback_results),
                            "scores_detail": diag_scores[:5]  # Primeros 5 para no saturar
                        }
                    )
                    
                    if above_threshold == 0:
                        self.logger.error(
                            f"[DIAG] PROBLEMA: Todos los resultados están bajo el threshold",
                            extra={
                                "similarity_threshold": similarity_threshold,
                                "max_score_found": max(r.score for r in fallback_results),
                                "suggestion": f"Considerar bajar threshold a {max(r.score for r in fallback_results) * 0.9:.3f}"
                            }
                        )
                    else:
                        self.logger.warning(
                            f"[DIAG] INESPERADO: Hay {above_threshold} resultados sobre threshold pero la búsqueda original no los encontró"
                        )
                else:
                    self.logger.error(
                        f"[DIAG] PROBLEMA CRÍTICO: Búsqueda fallback también retornó 0 resultados",
                        extra={
                            "implication": "Los filtros están eliminando todos los puntos disponibles"
                        }
                    )
            except Exception as e:
                self.logger.warning(f"[Diag] Scroll diagnostic failed: {e}", exc_info=True)
        
        # Convertir a RAGChunk CON agent_id y collection_id del payload
        all_results = []
        for hit in results:
            chunk = RAGChunk(
                chunk_id=str(hit.id),
                content=hit.payload.get("content", ""),  # Ya usa 'content' 
                document_id=UUID(hit.payload.get("document_id", str(UUID(int=0)))),
                collection_id=hit.payload.get("collection_id", ""),  # Del payload, no parámetro
                similarity_score=hit.score,
                metadata={
                    **hit.payload.get("metadata", {}),
                    "agent_ids": hit.payload.get("agent_ids", [str(agent_id)]),
                    "tenant_id": hit.payload.get("tenant_id", str(tenant_id))
                }
            )
            all_results.append(chunk)
        
        # Ordenar por score
        all_results.sort(key=lambda x: x.similarity_score, reverse=True)
        
        # LOG FINAL: Resumen de resultados
        final_count = min(len(all_results), top_k)
        self.logger.info(
            f"[SEARCH] Búsqueda completada",
            extra={
                "total_results_found": len(all_results),
                "final_results_returned": final_count,
                "top_k_requested": top_k,
                "agent_id": str(agent_id),
                "tenant_id": str(tenant_id),
                "collection_ids": collection_ids,
                "final_scores": [r.similarity_score for r in all_results[:5]] if all_results else [],
                "final_chunk_ids": [r.chunk_id for r in all_results[:3]] if all_results else []
            }
        )
        
        # Retornar solo top_k globales
        return all_results[:top_k]
    
    async def close(self):
        """Cierra el cliente."""
        await self.client.close()