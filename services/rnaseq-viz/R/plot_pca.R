#!/usr/bin/env Rscript
# Parameterized PCA. Paths and sample names come only from CLI arguments.
# Usage:
#   Rscript plot_pca.R --matrix expr.tsv --metadata samples.tsv --out-dir out \
#     --transform none|log2 --scale center|zscore|none

args <- commandArgs(trailingOnly = TRUE)
opt <- list(
  matrix = NA_character_,
  metadata = NA_character_,
  out_dir = NA_character_,
  transform = "none",
  scale = "center",
  gene_column = "",
  sample_column = "",
  group_column = ""
)
i <- 1L
while (i <= length(args)) {
  key <- args[[i]]
  if (!startsWith(key, "--")) stop("无法识别的参数: ", key)
  if (i == length(args)) stop("参数缺少取值: ", key)
  name <- gsub("-", "_", substring(key, 3L))
  if (!name %in% names(opt)) stop("无法识别的参数: ", key)
  opt[[name]] <- args[[i + 1L]]
  i <- i + 2L
}
if (is.na(opt$matrix) || is.na(opt$metadata) || is.na(opt$out_dir)) {
  stop("必须提供 --matrix --metadata --out-dir")
}
if (!opt$transform %in% c("none", "log2")) stop("transform 只能是 none 或 log2")
if (!opt$scale %in% c("center", "zscore", "none")) stop("scale 只能是 center、zscore 或 none")

read_table <- function(path) {
  header <- readLines(path, n = 1L, warn = FALSE, encoding = "UTF-8")
  if (length(header) == 0L) stop(basename(path), " 是空的")
  tabs <- lengths(regmatches(header, gregexpr("\t", header)))
  commas <- lengths(regmatches(header, gregexpr(",", header)))
  sep <- if (tabs > 0 && tabs >= commas) "\t" else ","
  utils::read.table(
    path,
    header = TRUE,
    sep = sep,
    quote = "\"",
    comment.char = "#",
    check.names = FALSE,
    stringsAsFactors = FALSE,
    fileEncoding = "UTF-8"
  )
}

norm_name <- function(x) gsub("[\\s\\-]+", "_", tolower(trimws(x)), perl = TRUE)
find_col <- function(header, explicit, aliases) {
  if (nzchar(explicit)) {
    hit <- which(norm_name(header) == norm_name(explicit) | header == explicit)
    if (length(hit) != 1L) stop("找不到列 ", explicit)
    return(hit[[1L]])
  }
  hit <- which(norm_name(header) %in% aliases)
  if (length(hit) == 0L) return(NA_integer_)
  hit[[1L]]
}

expr <- read_table(opt$matrix)
meta <- read_table(opt$metadata)
gene_idx <- find_col(
  names(expr),
  opt$gene_column,
  c("gene_id", "geneid", "gene", "id", "gene_name", "genename")
)
if (is.na(gene_idx)) gene_idx <- 1L
sample_names <- names(expr)[-gene_idx]
if (length(sample_names) < 2L) stop("表达矩阵至少需要 2 个样本列")
if (length(sample_names) > 80L) stop("样本数超过上限 80")
mat <- as.matrix(expr[, sample_names, drop = FALSE])
storage.mode(mat) <- "double"
if (anyNA(mat)) stop("表达矩阵含有非数字")
if (nrow(mat) < 2L) stop("表达矩阵至少需要 2 个基因")
if (nrow(mat) > 50000L) stop("基因数超过上限 50000")
genes <- as.character(expr[[gene_idx]])
if (anyDuplicated(genes)) stop("基因 ID 重复")

sample_idx <- find_col(
  names(meta),
  opt$sample_column,
  c("sample", "sample_id", "sampleid", "sample_name", "samplename")
)
if (is.na(sample_idx)) stop("样本表需要 sample 列（或 sample_id）")
group_idx <- find_col(
  names(meta),
  opt$group_column,
  c("group", "condition", "subgroup", "treatment")
)
meta_samples <- as.character(meta[[sample_idx]])
if (anyDuplicated(meta_samples)) stop("样本名重复")
groups <- if (is.na(group_idx)) rep("ungrouped", nrow(meta)) else {
  g <- trimws(as.character(meta[[group_idx]]))
  ifelse(nzchar(g), g, "ungrouped")
}
names(groups) <- meta_samples
missing <- setdiff(sample_names, meta_samples)
extra <- setdiff(meta_samples, sample_names)
if (length(missing)) stop("样本表缺少矩阵中的样本: ", paste(head(missing, 5L), collapse = "、"))
if (length(extra)) stop("样本表有矩阵中不存在的样本: ", paste(head(extra, 5L), collapse = "、"))
mat <- mat[, meta_samples, drop = FALSE]
groups <- unname(groups[meta_samples])
sample_names <- meta_samples

if (opt$transform == "log2") {
  if (any(mat < 0, na.rm = TRUE)) stop("log2 变换要求表达量非负，或改用 --transform none")
  mat <- log2(mat + 1)
}

keep <- apply(mat, 1L, function(v) stats::var(v) >= 1e-18)
dropped <- sum(!keep)
mat <- mat[keep, , drop = FALSE]
if (nrow(mat) < 2L) stop("有效基因少于 2（其余方差为 0）")

scaled <- t(mat)
if (opt$scale == "center") {
  scaled <- scale(scaled, center = TRUE, scale = FALSE)
} else if (opt$scale == "zscore") {
  scaled <- scale(scaled, center = TRUE, scale = TRUE)
}
scaled <- as.matrix(scaled)

pc <- stats::prcomp(scaled, center = FALSE, scale. = FALSE)
n_pc <- min(2L, ncol(pc$x))
scores <- pc$x[, seq_len(n_pc), drop = FALSE]
if (ncol(scores) == 1L) scores <- cbind(scores, 0)
colnames(scores) <- c("PC1", "PC2")
for (j in 1:2) {
  k <- which.max(abs(scores[, j]))
  if (length(k) == 1L && scores[k, j] < 0) scores[, j] <- -scores[, j]
}
fractions <- pc$sdev^2 / sum(pc$sdev^2)
if (length(fractions) < 2L) fractions <- c(fractions, 0)

dir.create(opt$out_dir, recursive = TRUE, showWarnings = FALSE)
score_df <- data.frame(
  sample = sample_names,
  group = groups,
  PC1 = scores[, 1],
  PC2 = scores[, 2],
  check.names = FALSE
)
utils::write.table(
  score_df,
  file.path(opt$out_dir, "pca_scores.tsv"),
  sep = "\t",
  quote = FALSE,
  row.names = FALSE
)
var_df <- data.frame(pc = c("PC1", "PC2"), variance_fraction = fractions[1:2])
utils::write.table(
  var_df,
  file.path(opt$out_dir, "pca_variance.tsv"),
  sep = "\t",
  quote = FALSE,
  row.names = FALSE
)

json_escape <- function(s) {
  s <- gsub("\\\\", "\\\\\\\\", s)
  s <- gsub("\"", "\\\\\"", s)
  gsub("[\r\n]", " ", s)
}
score_json <- vapply(seq_len(nrow(score_df)), function(i) {
  sprintf(
    '{"sample":"%s","group":"%s","PC1":%.8g,"PC2":%.8g}',
    json_escape(score_df$sample[[i]]),
    json_escape(score_df$group[[i]]),
    score_df$PC1[[i]],
    score_df$PC2[[i]]
  )
}, character(1))
summary_json <- sprintf(
  '{"genes_used":%d,"genes_dropped":%d,"n_samples":%d,"transform":"%s","scale":"%s","variance":[{"pc":"PC1","fraction":%.8g},{"pc":"PC2","fraction":%.8g}],"scores":[%s]}\n',
  nrow(mat),
  dropped,
  length(sample_names),
  opt$transform,
  opt$scale,
  fractions[[1]],
  fractions[[2]],
  paste(score_json, collapse = ",")
)
writeLines(summary_json, file.path(opt$out_dir, "pca_summary.json"), useBytes = TRUE)

draw <- function() {
  palette_hex <- c("#0F766E", "#B45309", "#1E40AF", "#9D174D", "#166534", "#7C2D12", "#4338CA", "#0369A1")
  group_levels <- unique(groups)
  cols <- palette_hex[(match(groups, group_levels) - 1L) %% length(palette_hex) + 1L]
  op <- par(mar = c(4.5, 4.5, 2.5, 8), xpd = NA)
  on.exit(par(op), add = TRUE)
  plot(
    scores[, 1],
    scores[, 2],
    pch = 19,
    col = cols,
    xlab = sprintf("PC1 (%.1f%%)", 100 * fractions[[1]]),
    ylab = sprintf("PC2 (%.1f%%)", 100 * fractions[[2]]),
    main = "PCA"
  )
  if (nrow(scores) <= 30L) text(scores[, 1], scores[, 2], labels = sample_names, pos = 3, cex = 0.7)
  legend(
    "topright",
    inset = c(-0.28, 0),
    legend = group_levels,
    pch = 19,
    col = palette_hex[(seq_along(group_levels) - 1L) %% length(palette_hex) + 1L],
    bty = "n"
  )
}

grDevices::pdf(file.path(opt$out_dir, "pca.pdf"), width = 10, height = 6.6)
draw()
grDevices::dev.off()

png_ok <- TRUE
tryCatch(
  {
    grDevices::png(file.path(opt$out_dir, "pca.png"), width = 1200, height = 800, res = 120, type = "cairo")
    draw()
    grDevices::dev.off()
  },
  error = function(e) {
    png_ok <<- FALSE
    if (grDevices::dev.cur() > 1L) grDevices::dev.off()
  }
)
if (!png_ok) {
  message("png 设备不可用，已保留 PDF。安装 cairo 后可写出 pca.png。")
}
