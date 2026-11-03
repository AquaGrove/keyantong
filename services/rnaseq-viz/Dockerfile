# Python CLI only. Rscript R/plot_pca.R is optional and is not installed here.
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY rnaseq_viz ./rnaseq_viz
COPY R ./R
COPY examples ./examples
RUN pip install --no-cache-dir .
ENTRYPOINT ["python", "-m", "rnaseq_viz"]
