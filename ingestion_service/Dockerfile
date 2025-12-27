# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the dependencies file to the working directory
COPY .env .
COPY ingestion_service/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the service code into the container
COPY ingestion_service/ /app/ingestion_service/

# Copy the common module
COPY common/ /app/common/

# Set PYTHONPATH to include the root app directory
ENV PYTHONPATH=/app

# Expose HTTP port for API
EXPOSE 8002

# Define the command to run the service
CMD ["python", "-m", "ingestion_service.main", "--mode", "full"]
