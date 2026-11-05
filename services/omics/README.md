# Shared CPU omics runtime

`catalog/analysis/methods.json` is the authoritative allowlist, parameter contract and version registry for the portal and worker. New algorithms require a reviewed implementation, explicit schema, independent environment/license evidence and runnable fixtures before registration. User input cannot specify commands, images, scripts or download URLs. No Docker socket is mounted.

Current methods:

- `gwas.plink-linear.v1`: diploid, biallelic SNP integer dosage CSV, quantitative phenotype, PLINK QC → LD pruning → PCA → covariate linear association → Manhattan/QQ and corrected statistics. Not an LMM or a polyploid method.
- `bsa.delta.v1`: two-bulk counts, depth filtering, ALT frequency/ΔSNP-index, read-count Fisher/BH, non-overlapping fixed windows. Descriptive exploratory baseline, not calibrated segregation inference or CausalBSA.

Shared software includes R DESeq2/edgeR/limma/statmod, PyDESeq2, PLINK, SAMtools/BCFtools/BEDTools/VCFtools/tabix, BWA/minimap2, STAR/HISAT2/Salmon/Subread, fastp/FastQC/MultiQC, BLAST+/MAFFT/IQ-TREE/SeqKit. Installed binaries and Python versions are captured in every result. Proprietary web services are linked in the directory, not redistributed.

```sh
docker build -f services/omics/Dockerfile -t keyantong-omics:20261105 .
docker run --rm keyantong-omics:20261105 python -m unittest discover -s tests -v
docker run --rm keyantong-omics:20261105 python -m keyantong_omics.run --method gwas.plink-linear.v1 --input /opt/omics/fixtures --output /tmp/gwas
```

Templates are deterministic synthetic data, never evidence of scientific accuracy. Validate external studies and ploidy/relatedness assumptions separately before upgrading maturity. See docs/31-omics-and-resource-atlas.md for schema, limits and deployment.
