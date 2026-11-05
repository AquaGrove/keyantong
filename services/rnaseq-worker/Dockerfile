# Build common runtime first: services/omics/Dockerfile.
FROM keyantong-omics:20261105
USER root
WORKDIR /opt/rnaseq
COPY services/rnaseq-pipeline/pyproject.toml /opt/rnaseq/pipeline/pyproject.toml
COPY services/rnaseq-pipeline/keyantong_rnaseq /opt/rnaseq/pipeline/keyantong_rnaseq
COPY services/rnaseq-pipeline/r /opt/rnaseq/pipeline/r
COPY services/rnaseq-pipeline/annotations /opt/rnaseq/pipeline/annotations
COPY services/rnaseq-worker/worker.py /opt/rnaseq/worker.py
COPY services/rnaseq-worker/quota.py /opt/rnaseq/quota.py
RUN pip install --no-cache-dir --no-deps -e /opt/rnaseq/pipeline && python -c "import pydeseq2; import keyantong_rnaseq"
ENV RNASEQ_DATA_ROOT=/data/rnaseq RNASEQ_JOB_MAX_BYTES=85899345920 RNASEQ_MAX_CONCURRENT=1 RNASEQ_QUEUE_MAX=8 RNASEQ_DISK_WATERMARK=85 PYTHONPATH=/opt/rnaseq/pipeline
# Existing bind volume is owned by the portal uid.
USER 1001:1001
CMD ["python", "/opt/rnaseq/worker.py"]
