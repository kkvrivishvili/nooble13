# Dockerfile para desarrollo del frontend con Vite
FROM node:22-alpine

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer puerto 5173 (puerto por defecto de Vite)
EXPOSE 5173

# Comando para ejecutar en modo desarrollo con hot-reload
# --host 0.0.0.0 permite conexiones desde fuera del container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
