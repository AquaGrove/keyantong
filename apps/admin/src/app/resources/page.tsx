import { AdminShell } from "@/components/admin-shell";
import { ResourceReviewPanel } from "./review-panel";
export default function ResourcesPage() {
  return (
    <AdminShell>
      <h1>科研资源审核</h1>
      <p className="lead">
        核对官方网站、物种/版本、输入输出、操作说明与许可。审核通过后进入公开目录，退回或下架须说明原因。
      </p>
      <ResourceReviewPanel />
    </AdminShell>
  );
}
