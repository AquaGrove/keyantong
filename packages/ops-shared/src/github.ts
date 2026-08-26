import { getGithubOwner, getGithubRepo } from "./site";

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
  labels?: { name: string }[];
  pull_request?: { url: string };
};

async function gh<T>(path: string, revalidate = 60): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "keyantong-ops",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API}${path}`, {
      headers,
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchRepoSummary() {
  return gh<RepoSummary>(`/repos/${getGithubOwner()}/${getGithubRepo()}`);
}

export async function fetchRecentCommits(limit = 12) {
  return gh<CommitItem[]>(
    `/repos/${getGithubOwner()}/${getGithubRepo()}/commits?per_page=${limit}`,
  );
}

export async function fetchOpenPulls(limit = 10) {
  return gh<IssueItem[]>(
    `/repos/${getGithubOwner()}/${getGithubRepo()}/pulls?state=open&per_page=${limit}`,
  );
}

export async function fetchOpenIssues(limit = 10) {
  const items = await gh<IssueItem[]>(
    `/repos/${getGithubOwner()}/${getGithubRepo()}/issues?state=open&per_page=${limit}`,
  );
  if (!items) return null;
  return items.filter((i) => !i.pull_request);
}

export async function fetchIssuesByLabel(label: string, limit = 10) {
  const q = encodeURIComponent(
    `repo:${getGithubOwner()}/${getGithubRepo()} is:issue is:open label:${label}`,
  );
  const data = await gh<{ items: IssueItem[] }>(
    `/search/issues?q=${q}&per_page=${limit}`,
  );
  return data?.items ?? null;
}

export type HealthCheck = {
  name: string;
  ok: boolean;
  detail: string;
  href?: string;
};

export async function checkSelfHealth(name = "本服务"): Promise<HealthCheck> {
  return {
    name,
    ok: true,
    detail: "正在响应",
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
