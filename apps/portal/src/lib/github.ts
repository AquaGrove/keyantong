import { GITHUB_OWNER, GITHUB_REPO } from "./site";

const API = "https://api.github.com";

export type RepoSummary = {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  default_branch: string;
  watchers_count: number;
};

export type CommitItem = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  author: { login: string; avatar_url: string } | null;
};

export type IssueItem = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  user: { login: string } | null;
  created_at: string;
  pull_request?: { url: string };
};

async function gh<T>(path: string): Promise<T | null> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "keyantong-portal",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API}${path}`, {
      headers,
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchRepoSummary() {
  return gh<RepoSummary>(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
}

export async function fetchRecentCommits(limit = 12) {
  return gh<CommitItem[]>(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=${limit}`,
  );
}

export async function fetchOpenPulls(limit = 10) {
  return gh<IssueItem[]>(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=open&per_page=${limit}`,
  );
}

export async function fetchOpenIssues(limit = 10) {
  const items = await gh<IssueItem[]>(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?state=open&per_page=${limit}`,
  );
  if (!items) return null;
  return items.filter((i) => !i.pull_request);
}

export type HealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
  href?: string;
};

export async function checkPortalHealth(): Promise<HealthCheck> {
  return {
    name: "门户 Portal",
    ok: true,
    detail: "本服务正在响应",
  };
}

export async function checkUpstreamHealth(
  name: string,
  url: string | undefined,
): Promise<HealthCheck> {
  if (!url) {
    return { name, ok: false, detail: "未配置" };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return {
      name,
      ok: res.ok,
      detail: `${res.status} ${res.statusText}`,
      href: url,
    };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: e instanceof Error ? e.message : "unreachable",
      href: url,
    };
  }
}
