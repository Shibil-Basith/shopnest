FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3005/health || exit 1
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3005"]
