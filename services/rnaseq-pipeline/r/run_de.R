#!/usr/bin/env Rscript
suppressPackageStartupMessages({})
args <- commandArgs(trailingOnly = TRUE)
get_arg <- function(flag, default = NULL) {
  i <- match(flag, args)
  if (is.na(i) || i == length(args)) return(default)
  args[[i + 1]]
}
engine <- tolower(get_arg("--engine", "limma"))
matrix_path <- get_arg("--matrix")
meta_path <- get_arg("--meta")
outdir <- get_arg("--outdir", ".")
lfc <- as.numeric(get_arg("--lfc", "1"))
padj_cut <- as.numeric(get_arg("--padj", "0.05"))
contrast_id <- get_arg("--contrast_id", "")
if (is.null(matrix_path) || is.null(meta_path)) stop("need --matrix and --meta")
dir.create(outdir, showWarnings = FALSE, recursive = TRUE)
mat <- as.matrix(read.csv(matrix_path, row.names = 1, check.names = FALSE))
meta <- read.csv(meta_path, stringsAsFactors = FALSE)
stopifnot(all(c("sample", "group") %in% names(meta)))
meta$group <- factor(meta$group, levels = c("control", "treatment"))
samples <- as.character(meta$sample)
missing <- setdiff(samples, colnames(mat))
if (length(missing)) stop(paste("missing samples:", paste(missing, collapse=",")))
mat <- mat[, samples, drop = FALSE]
storage.mode(mat) <- "double"
have <- function(pkg) requireNamespace(pkg, quietly = TRUE)
write_out <- function(res_df, engine_name) {
  res_df$engine <- engine_name
  res_df$contrast <- contrast_id
  res_df$significant <- (!is.na(res_df$padj) & res_df$padj <= padj_cut & abs(res_df$log2FC) >= lfc)
  res_df$regulation <- ifelse(res_df$significant & res_df$log2FC > 0, "up",
                       ifelse(res_df$significant & res_df$log2FC < 0, "down", "ns"))
  out <- file.path(outdir, "de_result.csv")
  write.csv(res_df, out, row.names = FALSE)
  cat(out, "\n")
}
if (engine %in% c("limma", "r_limma")) {
  if (!have("limma")) stop("limma not installed")
  logx <- log2(pmax(mat, 0) + 1)
  design <- model.matrix(~ 0 + group, data = meta)
  colnames(design) <- levels(meta$group)
  fit <- limma::lmFit(logx, design)
  contrast <- limma::makeContrasts(treatment - control, levels = design)
  fit2 <- limma::contrasts.fit(fit, contrast)
  fit2 <- limma::eBayes(fit2, robust = TRUE)
  tt <- limma::topTable(fit2, number = Inf, sort.by = "P")
  mean_c <- rowMeans(logx[, meta$group == "control", drop = FALSE])
  mean_t <- rowMeans(logx[, meta$group == "treatment", drop = FALSE])
  res <- data.frame(gene = rownames(tt), log2FC = tt$logFC,
    mean_control = mean_c[rownames(tt)], mean_treatment = mean_t[rownames(tt)],
    pvalue = tt$P.Value, padj = tt$adj.P.Val, t = tt$t, stringsAsFactors = FALSE)
  write_out(res, "r_limma")
} else if (engine %in% c("edger", "r_edger")) {
  if (!have("edgeR")) stop("edgeR not installed")
  counts <- round(pmax(mat, 0)); storage.mode(counts) <- "integer"
  group <- meta$group
  y <- edgeR::DGEList(counts = counts, group = group)
  keep <- edgeR::filterByExpr(y); y <- y[keep, , keep.lib.sizes = FALSE]
  y <- edgeR::calcNormFactors(y); design <- model.matrix(~ group)
  y <- edgeR::estimateDisp(y, design); fit <- edgeR::glmQLFit(y, design)
  qlf <- edgeR::glmQLFTest(fit, coef = 2); tt <- edgeR::topTags(qlf, n = Inf)$table
  logcpm <- edgeR::cpm(y, log = TRUE)
  mean_c <- rowMeans(logcpm[, group == "control", drop = FALSE])
  mean_t <- rowMeans(logcpm[, group == "treatment", drop = FALSE])
  res <- data.frame(gene = rownames(tt), log2FC = tt$logFC,
    mean_control = mean_c[rownames(tt)], mean_treatment = mean_t[rownames(tt)],
    pvalue = tt$PValue, padj = tt$FDR, stringsAsFactors = FALSE)
  write_out(res, "r_edger")
} else if (engine %in% c("deseq2", "r_deseq2")) {
  if (!have("DESeq2")) stop("DESeq2 not installed")
  counts <- round(pmax(mat, 0)); storage.mode(counts) <- "integer"
  coldata <- data.frame(row.names = samples, condition = meta$group)
  dds <- DESeq2::DESeqDataSetFromMatrix(countData = counts, colData = coldata, design = ~ condition)
  dds <- DESeq2::DESeq(dds, quiet = TRUE)
  res0 <- as.data.frame(DESeq2::results(dds, contrast = c("condition", "treatment", "control")))
  res0 <- res0[!is.na(res0$pvalue), , drop = FALSE]
  logx <- log2(pmax(mat, 0) + 1)
  res <- data.frame(gene = rownames(res0), log2FC = res0$log2FoldChange,
    mean_control = rowMeans(logx[rownames(res0), meta$group == "control", drop = FALSE]),
    mean_treatment = rowMeans(logx[rownames(res0), meta$group == "treatment", drop = FALSE]),
    pvalue = res0$pvalue, padj = res0$padj, stringsAsFactors = FALSE)
  write_out(res, "r_deseq2")
} else stop(paste("unknown engine", engine))
