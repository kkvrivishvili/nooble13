FROM python:3.12-slim

WORKDIR /app

# Copiar archivos necesarios
COPY .env .
COPY conversation_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código
COPY conversation_service/ /app/conversation_service/
COPY common/ /app/common/

# Variables de entorno
ENV PYTHONPATH=/app

# Puerto
EXPOSE 8004

# Comando
CMD ["uvicorn", "conversation_service.main:app", "--host", "0.0.0.0", "--port", "8004"]