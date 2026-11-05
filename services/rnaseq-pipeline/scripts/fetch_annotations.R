#!/usr/bin/env Rscript
# Export gene→GO and gene→KEGG TSV for human / mouse into annotations/.
# Sources: Bioconductor OrgDb + GO.db + KEGGREST (network).
# Large TSV files are intended to stay gitignored; re-run to refresh.
#
# Usage:
#   Rscript scripts/fetch_annotations.R [human|mouse|all] [annotations_dir]

suppressPackageStartupMessages({
  if (!requireNamespace("BiocManager", quietly = TRUE)) {
    install.packages("BiocManager", repos = "https://cloud.r-project.org")
  }
  needed <- c("AnnotationDbi", "org.Hs.eg.db", "org.Mm.eg.db", "GO.db", "KEGGREST")
  missing <- needed[!vapply(needed, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing)) {
    BiocManager::install(missing, ask = FALSE, update = FALSE)
  }
  library(AnnotationDbi)
  library(GO.db)
  library(KEGGREST)
})

args <- commandArgs(trailingOnly = TRUE)
species_filter <- if (length(args) >= 1) tolower(args[[1]]) else "all"

ca <- commandArgs(trailingOnly = FALSE)
file_arg <- sub("^--file=", "", grep("^--file=", ca, value = TRUE))
script_dir <- if (length(file_arg)) dirname(normalizePath(file_arg[[1]])) else getwd()
default_root <- normalizePath(file.path(script_dir, "..", "annotations"), mustWork = FALSE)
root <- if (length(args) >= 2) normalizePath(args[[2]], mustWork = FALSE) else default_root
dir.create(root, recursive = TRUE, showWarnings = FALSE)

specs <- list(
  human = list(dir = "human", org = "org.Hs.eg.db", kegg_org = "hsa", label = "Homo sapiens"),
  mouse = list(dir = "mouse", org = "org.Mm.eg.db", kegg_org = "mmu", label = "Mus musculus")
)

if (species_filter %in% names(specs)) {
  specs <- specs[species_filter]
} else if (!(species_filter %in% c("all", ""))) {
  stop("Unknown species filter: ", species_filter, " (use human|mouse|all)")
}

write_go <- function(org_pkg, out_tsv) {
  library(org_pkg, character.only = TRUE)
  orgdb <- get(org_pkg)
  message("  GO: selecting SYMBOL/GO/ONTOLOGY from ", org_pkg, " ...")
  df <- AnnotationDbi::select(
    orgdb,
    keys = AnnotationDbi::keys(orgdb, keytype = "ENTREZID"),
    columns = c("SYMBOL", "GO", "ONTOLOGY"),
    keytype = "ENTREZID"
  )
  df <- df[!is.na(df$GO) & !is.na(df$SYMBOL) & nzchar(as.character(df$SYMBOL)), , drop = FALSE]
  go_ids <- unique(as.character(df$GO))
  term_map <- tryCatch({
    tm <- AnnotationDbi::select(GO.db, keys = go_ids, columns = "TERM", keytype = "GOID")
    setNames(as.character(tm$TERM), as.character(tm$GOID))
  }, error = function(e) character())
  go_chr <- as.character(df$GO)
  out <- data.frame(
    gene = as.character(df$SYMBOL),
    go_id = go_chr,
    go_name = ifelse(go_chr %in% names(term_map), unname(term_map[go_chr]), go_chr),
    ontology = as.character(df$ONTOLOGY),
    stringsAsFactors = FALSE
  )
  out <- unique(out)
  dir.create(dirname(out_tsv), recursive = TRUE, showWarnings = FALSE)
  utils::write.table(out, out_tsv, sep = "\t", row.names = FALSE, quote = FALSE)
  message("  wrote ", out_tsv, " rows=", nrow(out))
  invisible(out_tsv)
}

write_kegg <- function(org_pkg, kegg_org, out_tsv) {
  library(org_pkg, character.only = TRUE)
  orgdb <- get(org_pkg)
  message("  KEGG: keggLink(pathway, ", kegg_org, ") via KEGGREST ...")
  links <- tryCatch(KEGGREST::keggLink("pathway", kegg_org), error = function(e) {
    message("  KEGGREST keggLink failed: ", conditionMessage(e))
    NULL
  })
  if (is.null(links) || length(links) == 0) {
    message("  skip KEGG for ", kegg_org)
    return(invisible(NULL))
  }
  gene_ids <- sub(paste0("^", kegg_org, ":"), "", names(links))
  pathway_ids <- sub("^path:", "", as.character(links))
  message("  KEGG: keggList(pathway, ", kegg_org, ") ...")
  path_list <- tryCatch(KEGGREST::keggList("pathway", kegg_org), error = function(e) {
    message("  KEGGREST keggList failed: ", conditionMessage(e))
    character()
  })
  path_names <- path_list
  if (length(path_names)) names(path_names) <- sub("^path:", "", names(path_list))

  entrez <- unique(gene_ids)
  sym <- AnnotationDbi::select(orgdb, keys = entrez, columns = "SYMBOL", keytype = "ENTREZID")
  sym_map <- setNames(as.character(sym$SYMBOL), as.character(sym$ENTREZID))
  genes <- unname(sym_map[gene_ids])
  keep <- !is.na(genes) & nzchar(genes)
  pname <- ifelse(pathway_ids %in% names(path_names), unname(path_names[pathway_ids]), pathway_ids)
  out <- data.frame(
    gene = genes[keep],
    kegg_id = pathway_ids[keep],
    kegg_name = as.character(pname[keep]),
    stringsAsFactors = FALSE
  )
  out <- unique(out)
  dir.create(dirname(out_tsv), recursive = TRUE, showWarnings = FALSE)
  utils::write.table(out, out_tsv, sep = "\t", row.names = FALSE, quote = FALSE)
  message("  wrote ", out_tsv, " rows=", nrow(out))
  invisible(out_tsv)
}

sizes <- list()
for (sp in names(specs)) {
  s <- specs[[sp]]
  message("==> ", s$label, " (", sp, ")")
  out_dir <- file.path(root, s$dir)
  dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
  go_tsv <- file.path(out_dir, "gene2go.tsv")
  kegg_tsv <- file.path(out_dir, "gene2kegg.tsv")
  write_go(s$org, go_tsv)
  write_kegg(s$org, s$kegg_org, kegg_tsv)
  sizes[[sp]] <- list(
    gene2go_bytes = if (file.exists(go_tsv)) as.numeric(file.info(go_tsv)$size) else 0,
    gene2kegg_bytes = if (file.exists(kegg_tsv)) as.numeric(file.info(kegg_tsv)$size) else 0
  )
}

meta_path <- file.path(root, "fetch_meta.json")
ts <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
lines <- c(
  "{",
  paste0('  "generated_at": "', ts, '",'),
  '  "source": "Bioconductor OrgDb + GO.db + KEGGREST",',
  paste0('  "annotations_root": "', gsub('\\\\', '/', root), '",'),
  '  "species": {'
)
sp_names <- names(sizes)
for (i in seq_along(sp_names)) {
  sp <- sp_names[[i]]
  comma <- if (i < length(sp_names)) "," else ""
  lines <- c(
    lines,
    paste0('    "', sp, '": {'),
    paste0('      "gene2go_bytes": ', sizes[[sp]]$gene2go_bytes, ","),
    paste0('      "gene2kegg_bytes": ', sizes[[sp]]$gene2kegg_bytes),
    paste0("    }", comma)
  )
}
lines <- c(lines, "  }", "}")
writeLines(lines, meta_path)
message("Done. meta -> ", meta_path)
