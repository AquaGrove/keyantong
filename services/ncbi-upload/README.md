# NCBI 数据上传协助（L-auto + 本机 ascp）

用户填写必要信息后，系统自动：

- 校验必填字段与文件名对账
- 生成 ascp 命令（密钥仅路径，不落库）
- **可选本机 dry-run / 执行 ascp**，写出 `status.json` + `ascp_progress.log`

```bash
cd services/ncbi-upload
PYTHONPATH=. python3 -m unittest discover -s tests -v
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --dry-run
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --run
```

Submission Portal 网页代填仍未自动化。
