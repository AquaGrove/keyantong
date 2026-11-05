export type DispatchIntent =
  | "rnaseq"
  | "ncbi"
  | "community"
  | "tools"
  | "papers"
  | "pricing"
  | "account"
  | "analysis"
  | "forum"
  | "general";

export type NextAction = {
  href: string;
  labelZh: string;
  labelEn: string;
};

export type DispatchPlan = {
  intent: DispatchIntent;
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  checklistZh: string[];
  checklistEn: string[];
  next?: NextAction;
};

const PLANS: Record<Exclude<DispatchIntent, "general">, DispatchPlan> = {
  analysis: {
    intent: "analysis",
    titleZh: "组学分析与协作",
    titleEn: "Omics analysis",
    bodyZh:
      "RNA-seq 已接入分析流程；BSA-seq、GWAS、单细胞方向可先发起协作，尚未提供在线计算。",
    bodyEn:
      "RNA-seq has an integrated workflow. Other omics directions currently support community collaboration.",
    checklistZh: [
      "研究目标与物种",
      "数据类型、样本设计与规模",
      "已有流程或遇到的瓶颈",
    ],
    checklistEn: [
      "Research question and species",
      "Data type and sample design",
      "Workflow or bottleneck",
    ],
    next: {
      href: "/analysis",
      labelZh: "进入组学分析",
      labelEn: "Open analysis",
    },
  },
  forum: {
    intent: "forum",
    titleZh: "科研论坛",
    titleEn: "Research community",
    bodyZh:
      "分享科研日常、心得、瓶颈与经验。登录后即可发帖和响应，不需要会员。",
    bodyEn:
      "Share notes, questions and experience. Sign in to contribute; no membership required.",
    checklistZh: ["一个想记录的发现或问题", "你已经尝试过的思路"],
    checklistEn: ["A discovery or question", "What you have tried"],
    next: {
      href: "/community",
      labelZh: "去科研广场",
      labelEn: "Open community",
    },
  },
  rnaseq: {
    intent: "rnaseq",
    titleZh: "转录组分析准备清单",
    titleEn: "RNA-seq analysis checklist",
    bodyZh:
      "好的。进入分析页前，请先在本地准备好下列材料。大文件会在你本机或分析 worker 处理，门户只收元数据与结果通知。",
    bodyEn:
      "Before opening the analysis studio, prepare the items below locally. Large files stay on your machine or the analysis worker; the portal only keeps metadata and result notices.",
    checklistZh: [
      "表达矩阵（counts / FPKM）或已对齐的定量结果；上游 FASTQ 任务需另挂载数据盘",
      "样本分组表：至少两组、每组建议 ≥3 生物学重复",
      "物种与注释偏好（人 / 鼠等；GO/KEGG 可选）",
      "对比方案（如 Treat vs Control）与是否要韦恩图",
    ],
    checklistEn: [
      "Expression matrix (counts / FPKM) or quantified tables; FASTQ upstream needs a mounted data volume",
      "Sample groups: ≥2 groups, ideally ≥3 biological replicates each",
      "Species / annotation preference (human, mouse, …; optional GO/KEGG)",
      "Contrasts (e.g. Treat vs Control) and whether you need Venn diagrams",
    ],
    next: {
      href: "/analysis/rnaseq",
      labelZh: "进入转录组分析",
      labelEn: "Open RNA-seq studio",
    },
  },
  ncbi: {
    intent: "ncbi",
    titleZh: "NCBI 本机直传准备",
    titleEn: "Local NCBI upload prep",
    bodyZh:
      "科研通只提供入口与校验：生成 ascp/脚本后，请在你自己的电脑直传 NCBI，避免占用我们的服务器带宽与磁盘。",
    bodyEn:
      "KeyanTong only validates metadata and builds a local pack. Run ascp/scripts on your own computer so raw data never relays through our cloud.",
    checklistZh: [
      "本机已装 Aspera Connect（ascp）",
      "NCBI 账户与 Submission Portal 中的提交草稿",
      "测序文件路径（仅用于生成命令，不会上传到科研通）",
      "元数据：BioProject / BioSample / 文库信息",
    ],
    checklistEn: [
      "Aspera Connect (ascp) installed locally",
      "NCBI account + Submission Portal draft",
      "Local sequencing file paths (for command generation only — not uploaded here)",
      "Metadata: BioProject / BioSample / library fields",
    ],
    next: {
      href: "/tools/ncbi-upload",
      labelZh: "打开 NCBI 上传向导",
      labelEn: "Open NCBI wizard",
    },
  },
  community: {
    intent: "community",
    titleZh: "文献 / 社区互助",
    titleEn: "Literature & community help",
    bodyZh:
      "可以在社区发起文献求助或工具求助。请提供 DOI/标题与已尝试的合法渠道；我们不做盗版 PDF 交换。",
    bodyEn:
      "Post a literature or tool help request. Include DOI/title and legal channels you already tried — we do not exchange pirated PDFs.",
    checklistZh: [
      "文献 DOI 或完整题名",
      "已尝试的 OA / 馆藏 / 作者稿路径",
      "用途说明（简短）",
    ],
    checklistEn: [
      "DOI or full title",
      "OA / library / author-manuscript paths already tried",
      "Short note on intended use",
    ],
    next: {
      href: "/literature",
      labelZh: "前往文献互助",
      labelEn: "Go to community",
    },
  },
  tools: {
    intent: "tools",
    titleZh: "工具分享与检索",
    titleEn: "Tool share & search",
    bodyZh:
      "发现好用的科研工具？发帖分享下载链接与功能描述；搜不到可转求助，有人能解决会去对应帖回复。",
    bodyEn:
      "Share a useful research tool with a download link and description. If search finds nothing, open a help post so others can reply.",
    checklistZh: [
      "工具名称与一句话功能",
      "合规下载链接（http/https）",
      "适用场景标签（可选）",
    ],
    checklistEn: [
      "Tool name + one-line purpose",
      "Compliant download URL (http/https)",
      "Optional tags for the use case",
    ],
    next: {
      href: "/tools",
      labelZh: "打开科研工具",
      labelEn: "Open tool board",
    },
  },
  papers: {
    intent: "papers",
    titleZh: "文献关系网",
    titleEn: "Literature network",
    bodyZh: "用公开学术图谱探索引用邻域与相关工作，作为社区求助前的检索辅助。",
    bodyEn:
      "Explore citation neighborhoods via open scholarly graphs before posting a help request.",
    checklistZh: ["一篇种子文献的 DOI 或标题", "想看引用还是被引邻域"],
    checklistEn: [
      "Seed paper DOI or title",
      "Whether you want citing or cited neighborhood",
    ],
    next: {
      href: "/papers",
      labelZh: "打开文献关系网",
      labelEn: "Open papers graph",
    },
  },
  pricing: {
    intent: "pricing",
    titleZh: "定价与试用",
    titleEn: "Pricing & trial",
    bodyZh:
      "校园邮箱可注册试用；永久会员由站务开通。AI 助手与部分工具配额与会员相关。",
    bodyEn:
      "Campus email unlocks a trial; lifetime membership is granted by operators. AI and some tool quotas follow membership.",
    checklistZh: ["准备校园邮箱完成注册", "了解试用到期后的权益变化"],
    checklistEn: [
      "Have a campus email ready to register",
      "Know what changes when the trial ends",
    ],
    next: { href: "/pricing", labelZh: "查看定价", labelEn: "View pricing" },
  },
  account: {
    intent: "account",
    titleZh: "账号与设备",
    titleEn: "Account & devices",
    bodyZh: "登录后可查看会员状态、已绑定设备与通知。",
    bodyEn:
      "After sign-in you can review membership, devices, and notifications.",
    checklistZh: ["已注册的校园邮箱", "登录密码"],
    checklistEn: ["Registered campus email", "Password"],
    next: { href: "/account", labelZh: "进入账号", labelEn: "Open account" },
  },
};

export function detectIntent(text: string): DispatchIntent {
  const t = text.toLowerCase();
  if (/bsa[\s-]?seq|gwas|单细胞|single[ -]?cell|组学|混池|全基因组关联/.test(t))
    return "analysis";
  if (
    /论坛|心得|感悟|科研日常|实验瓶颈|经验分享|发动态|research diary|forum/.test(
      t,
    )
  )
    return "forum";
  if (/文献网|引用|openalex|papers? graph|关系网/.test(t)) return "papers";
  if (
    /转录组|rna[\s-]?seq|rnaseq|差异表达|\bdeg\b|count.?matrix|fastq|表达矩阵|火山图|韦恩/.test(
      t,
    )
  ) {
    return "rnaseq";
  }
  if (
    /ncbi|sra|geo|ascp|aspera|submission\s*portal|上传.*(数据|测序)|测序.*上传|biosample|bioproject/.test(
      t,
    )
  ) {
    return "ncbi";
  }
  if (
    /文献求助|找文献|pdf|doi|求助帖|community|互助/.test(t) &&
    !/工具/.test(t)
  ) {
    return "community";
  }
  if (
    /工具分享|分享工具|软件推荐|检索工具|下载链接|tool\s*share|找个工具|比对工具|序列比对/.test(
      t,
    )
  ) {
    return "tools";
  }
  if (/文献网|引用|openalex|papers? graph|关系网/.test(t)) {
    return "papers";
  }
  if (/定价|会员|试用|pricing|membership|多少钱/.test(t)) {
    return "pricing";
  }
  if (/登录|注册|账号|账户|设备|login|account|register/.test(t)) {
    return "account";
  }
  if (/文献|paper|求助/.test(t)) return "community";
  if (/工具|tool/.test(t)) return "tools";
  return "general";
}

export function planForIntent(intent: DispatchIntent): DispatchPlan {
  if (intent === "general") {
    return {
      intent: "general",
      titleZh: "我可以帮你调度这些模块",
      titleEn: "I can route you to these modules",
      bodyZh:
        "试试说：分析转录组、GWAS 协作、NCBI 上传、分享工具、文献求助、分享科研心得。首页提供文献互助、科研工具、组学分析与科研论坛入口，所有人都能贡献经验或响应求助。",
      bodyEn:
        "Try: RNA-seq analysis, NCBI upload, share a tool, or literature help. The home page stays chat-first; modules open after you confirm.",
      checklistZh: [
        "转录组 → 准备矩阵/分组后进入分析页",
        "NCBI → 本机 ascp 直传，不经服务器中转",
        "工具分享 / 文献 → 社区发帖与检索",
      ],
      checklistEn: [
        "RNA-seq → prepare matrix/groups, then open the studio",
        "NCBI → local ascp direct to NCBI (no server relay)",
        "Tools / literature → community posts & search",
      ],
      next: {
        href: "/tools",
        labelZh: "浏览全部工具",
        labelEn: "Browse all tools",
      },
    };
  }
  return PLANS[intent];
}

export function renderPlan(
  plan: DispatchPlan,
  locale: "zh" | "en",
): {
  title: string;
  body: string;
  checklist: string[];
  next?: { href: string; label: string };
} {
  const zh = locale === "zh";
  return {
    title: zh ? plan.titleZh : plan.titleEn,
    body: zh ? plan.bodyZh : plan.bodyEn,
    checklist: zh ? plan.checklistZh : plan.checklistEn,
    next: plan.next
      ? {
          href: plan.next.href,
          label: zh ? plan.next.labelZh : plan.next.labelEn,
        }
      : undefined,
  };
}
