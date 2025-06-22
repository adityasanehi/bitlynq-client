# Use Python 3.11 slim image for better compatibility
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    libtorrent-rasterbar-dev \
    pkg-config \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create directories
RUN mkdir -p /app/downloads /app/data /app/logs

# Copy application code
COPY . .

# Create non-root user
RUN groupadd -r torrent && useradd -r -g torrent torrent
RUN chown -R torrent:torrent /app
USER torrent

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]