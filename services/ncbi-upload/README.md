# NCBI 数据上传协助

校验 → ascp 命令 → 本机 dry-run/执行（异步 Job 轮询）。密钥仅路径。

**Submission Portal 网页代填 / 自动提交不在范围内。** 使用 `portal_checklist` 跟踪人工步骤（`automation_policy=no_browser_automation`）。

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -v
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --dry-run
```
