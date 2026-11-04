export type Locale = "zh" | "en";

export const LOCALES: Locale[] = ["zh", "en"];
export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_COOKIE = "kt_locale";

type Dict = Record<string, string>;

const zh: Dict = {
  "brand.name": "科研通",
  "brand.tagline": "开源共享 · 合规互助 · Apache-2.0",
  "nav.home": "首页",
  "nav.papers": "文献网",
  "nav.community": "社区",
  "nav.tools": "工具",
  "nav.ai": "AI",
  "nav.pricing": "定价",
  "nav.about": "关于",
  "nav.login": "登录",
  "nav.register": "注册",
  "nav.account": "账号",
  "nav.notifications": "通知",
  "nav.more": "更多",
  "lang.zh": "中文",
  "lang.en": "EN",
  "lang.toggle": "语言",
  "footer.contact": "联系我们",
  "footer.docs": "文档",
  "footer.contribute": "贡献指南",
  "footer.license": "许可证",
  "home.kicker": "OPEN SCIENCE · AI DISPATCH",
  "home.title": "科研通",
  "home.lead": "用一句话描述你的科研需求。助手会告诉你要准备什么，并带你进入对应模块——文献互助、工具分享、转录组分析、NCBI 本机上传。",
  "home.chat.placeholder": "例如：我想分析转录组数据 / 帮我上传到 NCBI / 找一个序列比对工具",
  "home.chat.send": "发送",
  "home.chat.enterHint": "Enter 发送 · Shift+Enter 换行",
  "home.chat.thinking": "思考中…",
  "home.chat.welcome": "你好，我是科研通调度助手。直接说需求即可，例如「分析转录组」「NCBI 上传」「分享工具」或「文献求助」。",
  "home.chat.next": "下一步",
  "home.chat.loginHint": "登录后可调用大模型增强回答；未登录时仍可用规则引导进入各模块。",
  "home.suggest.rnaseq": "分析转录组",
  "home.suggest.ncbi": "NCBI 本机上传",
  "home.suggest.tools": "分享/检索工具",
  "home.suggest.community": "文献求助",
  "home.intro.badge": "入口即对话",
  "notif.title": "通知中心",
  "notif.lead": "分析结果、站内通知与最新热点分模块展示。",
  "notif.tab.results": "分析结果",
  "notif.tab.system": "站内通知",
  "notif.tab.hot": "最新热点",
  "notif.empty": "暂无消息",
  "notif.markRead": "标为已读",
  "tools.ai.title": "AI 助手",
  "tools.rnaseq.title": "转录组分析",
  "tools.ncbi.title": "NCBI 本机上传",
};

const en: Dict = {
  "brand.name": "KeyanTong",
  "brand.tagline": "Open source · Compliant mutual aid · Apache-2.0",
  "nav.home": "Home",
  "nav.papers": "Papers",
  "nav.community": "Community",
  "nav.tools": "Tools",
  "nav.ai": "AI",
  "nav.pricing": "Pricing",
  "nav.about": "About",
  "nav.login": "Log in",
  "nav.register": "Sign up",
  "nav.account": "Account",
  "nav.notifications": "Alerts",
  "nav.more": "More",
  "lang.zh": "中文",
  "lang.en": "EN",
  "lang.toggle": "Language",
  "footer.contact": "Contact",
  "footer.docs": "Docs",
  "footer.contribute": "Contributing",
  "footer.license": "License",
  "home.kicker": "OPEN SCIENCE · AI DISPATCH",
  "home.title": "KeyanTong",
  "home.lead": "Describe your research need in one sentence. The assistant lists what to prepare and guides you into the right module—literature help, tool sharing, RNA-seq, or local NCBI upload.",
  "home.chat.placeholder": "e.g. Analyze RNA-seq / Upload to NCBI / Find an alignment tool",
  "home.chat.send": "Send",
  "home.chat.enterHint": "Enter to send · Shift+Enter for newline",
  "home.chat.thinking": "Thinking…",
  "home.chat.welcome": "Hi — I am the KeyanTong dispatcher. Say what you need, e.g. “RNA-seq analysis”, “NCBI upload”, “share a tool”, or “literature help”.",
  "home.chat.next": "Next step",
  "home.chat.loginHint": "Sign in for LLM-enhanced answers; guests still get rule-based routing into modules.",
  "home.suggest.rnaseq": "RNA-seq analysis",
  "home.suggest.ncbi": "Local NCBI upload",
  "home.suggest.tools": "Share / find tools",
  "home.suggest.community": "Literature help",
  "home.intro.badge": "Chat-first entry",
  "notif.title": "Notifications",
  "notif.lead": "Analysis results, site notices, and hot topics in separate sections.",
  "notif.tab.results": "Results",
  "notif.tab.system": "Notices",
  "notif.tab.hot": "Hot topics",
  "notif.empty": "No messages yet",
  "notif.markRead": "Mark read",
  "tools.ai.title": "AI assistant",
  "tools.rnaseq.title": "RNA-seq analysis",
  "tools.ncbi.title": "Local NCBI upload",
};

const tables: Record<Locale, Dict> = { zh, en };

export function translate(locale: Locale, key: string): string {
  return tables[locale][key] ?? tables.zh[key] ?? key;
}

export function isLocale(v: string | null | undefined): v is Locale {
  return v === "zh" || v === "en";
}
