export function NcbiAutomationIntro() {
  return (
    <section className="section ncbi-automation-intro">
      <div className="feed-heading">
        <div>
          <p className="page-kicker">LOCAL AUTOMATION / DEVELOPER PREVIEW</p>
          <h2>把复杂流程，交给本机工作台。</h2>
          <p>
            连接你的 NCBI 登录态，从准备材料到可恢复传输，每一步保留核验依据。
          </p>
        </div>
        <a
          className="btn btn-primary"
          href="/downloads/keyantong-ncbi-assistant-preview.zip"
          download
        >
          下载本机助手开发包 ↓
        </a>
      </div>
      <div className="ncbi-automation-flow">
        {[
          ["01", "连接账户", "本机 Chrome 登录，读取账户上传配置，下载私钥。"],
          ["02", "准备环境", "检测系统与 ascp，从 IBM 官方来源获取安装包。"],
          ["03", "核对并传输", "文件清单、校验和、明确确认，本机直传 NCBI。"],
          [
            "04",
            "核验与提交",
            "等待 Files 可见，核对元数据与公开日期，再完成提交。",
          ],
        ].map(([n, title, body]) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </div>
        ))}
      </div>
      <div className="capability-note">
        <strong>
          当前为开发预览，需要安装 Chrome 扩展与 Python 本机助手。
        </strong>
        <p>
          已实现系统检测、私钥导入、受限字段代填和本机任务编排。完整多样本网页流程、所有系统安装器和真实提交仍需验收；登录/MFA、安装许可、未知字段及最终提交由你核对完成。
        </p>
      </div>
      <p className="form-note">
        开发包内含源码与安装说明。运行包内 scripts/install_native_host.py 时按
        README 指定扩展 ID；没有后台云端代持账号。
        <a href="/downloads/keyantong-ncbi-assistant-preview.sha256">
          查看开发包 SHA-256
        </a>
      </p>
      <details>
        <summary>仍希望手动生成元数据与命令？</summary>
        <p className="form-note">
          可以继续使用下方四步表单。下载 Python
          助手后在数据所在电脑执行；生成命令或勾选进度不代表 NCBI 已接收和处理。
        </p>
      </details>
    </section>
  );
}
