"""
Cliente para interactuar con la API de Groq para preprocesamiento de documentos.
"""

import logging
from typing import Optional, Dict, Any, Tuple

from groq import AsyncGroq, APIConnectionError, RateLimitError, APIStatusError

class GroqClientError(Exception):
    """Excepción lanzada cuando hay un error con la API de Groq."""
    pass

class GroqClient:
    """Cliente para preprocesamiento de documentos usando Groq."""
    
    def __init__(self, api_key: str):
        """
        Inicializa el cliente.
        
        Args:
            api_key: API key de Groq
        """
        if not api_key:
            raise ValueError("API key de Groq es requerida")
            
        self.api_key = api_key
        self.client = AsyncGroq(api_key=api_key)
        self._logger = logging.getLogger(__name__)

    async def preprocess_document(
        self,
        system_prompt: str,
        content: str,
        model: str
    ) -> Tuple[str, Dict[str, int]]:
        """
        Envía un bloque de documento al LLM para preprocesamiento.
        
        Args:
            system_prompt: Prompt de sistema con instrucciones
            content: Contenido del bloque a procesar
            model: Modelo a usar
            
        Returns:
            Tuple de (texto_generado, uso_de_tokens)
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ]
        
        try:
            self._logger.info(
                f"--- [GROQ REQUEST] ---",
                extra={
                    "model": model,
                    "system_prompt_len": len(system_prompt),
                    "content_len": len(content)
                }
            )
            self._logger.debug(f"SYSTEM PROMPT:\n{system_prompt}")
            self._logger.debug(f"CONTENT PREVIEW:\n{content[:500]}...")
            
            response = await self.client.chat.completions.create(
                messages=messages,
                model=model,
                temperature=0.1,  # Temperatura baja para consistencia en preprocesamiento
            )
            
            output_text = response.choices[0].message.content
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
            
            self._logger.info(
                f"--- [GROQ RESPONSE] ---",
                extra={"usage": usage}
            )
            self._logger.debug(f"RAW OUTPUT:\n{output_text}")
            
            return output_text, usage
            
        except (APIConnectionError, RateLimitError, APIStatusError) as e:
            error_msg = f"Error de la API de Groq: {str(e)}"
            self._logger.error(error_msg)
            raise GroqClientError(error_msg)
        except Exception as e:
            error_msg = f"Error inesperado en GroqClient: {str(e)}"
            self._logger.error(error_msg)
            raise GroqClientError(error_msg)

    async def close(self):
        """Cierra el cliente y libera recursos."""
        await self.client.close()