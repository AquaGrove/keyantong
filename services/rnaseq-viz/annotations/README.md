# 物种注释

生产环境把 GMT 放在本目录下，不要把用户的富集结果表放进来。

```text
annotations/arabidopsis/go.gmt
annotations/arabidopsis/kegg.gmt
annotations/human/go.gmt
annotations/human/kegg.gmt
annotations/mouse/go.gmt
annotations/mouse/kegg.gmt
```

每一行：

```text
term_name<TAB>description<TAB>gene_id<TAB>gene_id...
```

基因 ID 必须和表达矩阵第一列相同。也可以把这一套目录放在别处，并设置 `RNASEQ_ANNOTATION_DIR`。库缺失时分析作业仍会给出差异表和 PCA / 火山图 / 热图，富集状态写成失败。
