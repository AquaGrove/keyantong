# Shared CPU analysis runtime. Licenced web services and unvalidated research binaries are separate adapters.
FROM python:3.11-slim-bookworm
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 MPLBACKEND=Agg OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMBA_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends \
 ca-certificates bash procps plink1.9 samtools bcftools bedtools tabix vcftools \
 bwa minimap2 fastp fastqc multiqc hisat2 subread rna-star salmon \
 ncbi-blast+ mafft iqtree seqkit r-base-core r-bioc-deseq2 r-bioc-edger r-bioc-limma \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/omics
COPY services/omics/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY catalog/analysis/methods.json /opt/omics/methods.json
COPY services/omics/keyantong_omics ./keyantong_omics
COPY services/omics/tests ./tests
COPY services/omics/fixtures ./fixtures
RUN python -m unittest discover -s tests -v
# Environment versions and package inventory are attached to every result manifest.
RUN dpkg-query -W > /opt/omics/system-packages.tsv && pip freeze > /opt/omics/python-packages.txt && \
 Rscript -e 'stopifnot(requireNamespace("DESeq2",quietly=TRUE),requireNamespace("edgeR",quietly=TRUE),requireNamespace("limma",quietly=TRUE))'
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig r-cran-statmod && rm -rf /var/lib/apt/lists/* && fc-cache -f && dpkg-query -W > /opt/omics/system-packages.tsv
ENV HOME=/tmp MPLCONFIGDIR=/tmp/kt-mpl XDG_CACHE_HOME=/tmp/kt-cache OMICS_RUNTIME_IMAGE=keyantong-omics:20261105
RUN useradd --uid 1002 --create-home analyst
USER analyst
CMD ["python", "-m", "keyantong_omics.worker"]
