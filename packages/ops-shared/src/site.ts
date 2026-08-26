export function getGithubOwner() {
  return process.env.NEXT_PUBLIC_GITHUB_OWNER ?? "AquaGrove";
}

export function getGithubRepo() {
  return process.env.NEXT_PUBLIC_GITHUB_REPO ?? "keyantong";
}

export function getGithubRepoFull() {
  return `${getGithubOwner()}/${getGithubRepo()}`;
}

export function getGithubUrl() {
  return `https://github.com/${getGithubRepoFull()}`;
}

export function getGithubDiscussionsUrl() {
  return `${getGithubUrl()}/discussions`;
}

export function getGithubIssuesUrl() {
  return `${getGithubUrl()}/issues`;
}

export function getGithubContributingUrl() {
  return `${getGithubUrl()}/blob/main/CONTRIBUTING.md`;
}

export function getGithubDocsUrl() {
  return `${getGithubUrl()}/blob/main/docs/INDEX.md`;
}

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.PUBLIC_PORTAL_URL ??
    process.env.PORTAL_URL ??
    "https://keyantong.zeabur.app"
  );
}

/** Forum URL when NodeBB is live; empty means use in-portal community hub. */
export function getCommunityHref(): string {
  const bbs = process.env.NEXT_PUBLIC_BBS_URL?.trim();
  if (!bbs || bbs.includes("localhost") || bbs.includes("bbs.keyantong.com")) {
    return "/community";
  }
  return bbs;
}
