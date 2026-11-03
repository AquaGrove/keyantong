# 本地注释映射（GO / KEGG）

把物种注释放在本目录下即可被流水线自动发现：

```
annotations/
  demo/          # 内置夹具（已随仓库）
    gene2go.tsv
    gene2kegg.tsv
  tryout/        # 门户「一键复制 demo」生成，仅试跑
    gene2go.tsv
    gene2kegg.tsv
  human/         # 可选：自行放入
    gene2go.tsv
    gene2kegg.tsv
  mouse/
    gene2go.tsv
    gene2kegg.tsv
  <custom>/
    gene2go.tsv
    gene2kegg.tsv
```

## 文件格式

Tab 分隔，首行为表头。列名可灵活识别：

**gene2go.tsv**
- gene / gene_id / symbol
- go_id / term / term_id
- go_name / term_name / name（可选）

**gene2kegg.tsv**
- gene / gene_id / symbol
- kegg_id / pathway / pathway_id
- kegg_name / pathway_name / name（可选）

## 获取人类 / 小鼠映射的建议

仓库**不捆绑**完整 NCBI / KEGG 商用映射。可自行：

1. 从 [Gene Ontology](https://geneontology.org/) / org.Hs.eg.db / org.Mm.eg.db 导出 gene→GO；
2. 从 [KEGG](https://www.kegg.jp/) 或 clusterProfiler 的 org 包导出 gene→pathway；
3. 写成上述 TSV，放入 `annotations/human/` 或 `annotations/mouse/`；
4. 门户物种下拉选 `human` / `mouse`，或 JSON `options.species` 填对应键。

`species=demo` 使用夹具注释，仅供冒烟与界面演示，**不要**当作真实生物学结论。

门户会员可在 `/tools/rnaseq` 点「一键复制 demo 注释到 tryout」，或直接选 `species=demo`。
