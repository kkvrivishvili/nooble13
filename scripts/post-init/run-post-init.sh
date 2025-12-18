#!/bin/bash

# Script multiplataforma para ejecutar scripts post-init
# Funciona en Windows (Git Bash/WSL) y Linux

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Ejecutando scripts post-init...${NC}"

# Verificar que Docker esté disponible
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado${NC}"
    exit 1
fi

# Verificar estado usando Docker directamente
echo -e "${YELLOW}🔍 Verificando estado de servicios...${NC}"

# Verificar si el contenedor está corriendo (método universal)
if docker ps --format "table {{.Names}}" | grep -q "supabase-db"; then
    echo -e "${GREEN}✅ El servicio db está corriendo${NC}"
    
    # Verificar conexión directa a PostgreSQL
    if docker exec supabase-db pg_isready -U postgres -h localhost -p 5432 >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL está accesible${NC}"
    else
        echo -e "${RED}❌ PostgreSQL no está accesible${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ El servicio db no está corriendo${NC}"
    echo -e "${YELLOW}💡 Por favor ejecuta: docker-compose up -d${NC}"
    exit 1
fi

# Verificar si hay scripts para ejecutar
if [ -z "$(ls -A scripts/post-init/*.sql 2>/dev/null)" ]; then
    echo -e "${YELLOW}ℹ️  No se encontraron scripts en scripts/post-init/${NC}"
    exit 0
fi

# Ejecutar scripts en orden
echo -e "${GREEN}📜 Ejecutando scripts post-init...${NC}"

# Lista de scripts a ejecutar
scripts=$(ls -1 scripts/post-init/*.sql | sort)

for script in $scripts; do
    script_name=$(basename "$script")
    echo -e "${GREEN}📜 Ejecutando: $script_name${NC}"
    
    # Ejecutar script con timeout
    if timeout 60 docker exec -i supabase-db psql -U postgres -d postgres < "$script"; then
        echo -e "${GREEN}✅ Completado: $script_name${NC}"
    else
        echo -e "${RED}❌ Error ejecutando: $script_name${NC}"
        exit 1
    fi
done

echo -e "${GREEN}🎉 Todos los scripts post-init han sido ejecutados exitosamente${NC}"