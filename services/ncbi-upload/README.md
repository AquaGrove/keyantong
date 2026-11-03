# NCBI 数据上传协助（L-auto）

用户只需填写**必要信息**（BioProject/BioSample/SRA 元数据、本地文件清单、运行时 Aspera 密钥路径与账户目标）。系统自动：

- 校验必填字段与文件名对账
- 生成 Submission Portal 模板字段清单
- 生成 `ascp` 命令（**密钥仅出现在本机命令中，不落库、不上传服务器**）

完整 Aspera 实际上传在本机执行；服务端只做编排与校验。

```bash
cd services/ncbi-upload
PYTHONPATH=. python3 -m unittest tests.test_validators -v
```
