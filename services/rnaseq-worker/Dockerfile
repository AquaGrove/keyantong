# RNAseq worker — downstream pipeline today; FASTQ tools layered later.
FROM python:3.11-slim-bookworm
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash curl ca-certificates procps coreutils findutils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/rnaseq
# Copy pipeline package (annotations optional volume)
COPY services/rnaseq-pipeline/pyproject.toml /opt/rnaseq/pipeline/pyproject.toml
COPY services/rnaseq-pipeline/keyantong_rnaseq /opt/rnaseq/pipeline/keyantong_rnaseq
COPY services/rnaseq-pipeline/r /opt/rnaseq/pipeline/r
COPY services/rnaseq-worker/worker.py /opt/rnaseq/worker.py
COPY services/rnaseq-worker/quota.py /opt/rnaseq/quota.py
RUN pip install --no-cache-dir -e "/opt/rnaseq/pipeline[deseq]" || pip install --no-cache-dir -e /opt/rnaseq/pipeline
ENV PYTHONUNBUFFERED=1 \
    RNASEQ_DATA_ROOT=/data/rnaseq \
    RNASEQ_JOB_MAX_BYTES=85899345920 \
    RNASEQ_MAX_CONCURRENT=1 \
    RNASEQ_QUEUE_MAX=8 \
    RNASEQ_DISK_WATERMARK=85
VOLUME ["/data/rnaseq"]
CMD ["python", "/opt/rnaseq/worker.py"]
