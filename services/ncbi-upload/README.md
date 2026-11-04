# NCBI 数据上传协助（本机执行）

**数据面在用户电脑**：校验元数据 → 生成 ascp 命令 → 本机 dry-run / 执行。  
科研通门户**不接收、不中转**测序文件；详见 `docs/19-ncbi-local-upload-architecture.md`。

密钥仅路径。**Submission Portal 网页代填不做。**

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -v
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --dry-run
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --run
```

## Aspera / ascp

需本机安装 IBM Aspera Connect（[下载](https://www.ibm.com/aspera/connect/)）。仓库不捆绑安装包。

```bash
command -v ascp || ls "$HOME/Applications/Aspera Connect.app/Contents/Resources/ascp" 2>/dev/null
```
