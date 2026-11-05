# 本地注释映射（GO / KEGG）

把物种注释放在本目录下即可被流水线自动发现：

```
annotations/
  demo/          # 内置夹具（已随仓库）
    gene2go.tsv
    gene2kegg.tsv
  tryout/        # 门户「一键复制 demo」生成，仅试跑（gitignore）
  human/         # 本机拉取：完整人类映射（*.tsv gitignore）
  mouse/         # 本机拉取：完整小鼠映射
  fetch_meta.json  # 拉取元信息（gitignore）
```

## 一键拉取人类 / 小鼠（推荐）

依赖本机 R + Bioconductor：`org.Hs.eg.db` `org.Mm.eg.db` `GO.db` `KEGGREST`。

```bash
cd services/rnaseq-pipeline
./scripts/fetch_annotations.sh          # human + mouse
./scripts/fetch_annotations.sh human    # 仅人类
./scripts/fetch_annotations.sh mouse ./annotations
```

来源：

- **GO**：OrgDb `SYMBOL`/`GO` + `GO.db` 术语名
- **KEGG**：`KEGGREST::keggLink` / `keggList`（需联网；学术本地缓存）

完整 TSV 体积可达数十 MB，**不进 Git**。服务器部署时在数据盘执行同一脚本，或把目录挂到 `annotations/`。

## 文件格式

Tab 分隔，首行为表头。

**gene2go.tsv**：`gene` / `go_id` / `go_name`（可选 `ontology`）  
**gene2kegg.tsv**：`gene` / `kegg_id` / `kegg_name`

## 门户

物种下拉选 `human` / `mouse` / `demo`。`species=demo` 仅冒烟演示，勿当作真实生物学结论。
