FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Add health check script
RUN echo '#!/bin/sh\ncurl -f http://localhost:3000 || exit 1' > /healthcheck.sh && \
    chmod +x /healthcheck.sh

# Start development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]