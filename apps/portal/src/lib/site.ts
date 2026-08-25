export const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER ?? "AquaGrove";
export const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "keyantong";
export const GITHUB_REPO_FULL = `${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_URL = `https://github.com/${GITHUB_REPO_FULL}`;
export const GITHUB_DISCUSSIONS_URL = `${GITHUB_URL}/discussions`;
export const GITHUB_ISSUES_URL = `${GITHUB_URL}/issues`;
export const GITHUB_CONTRIBUTING_URL = `${GITHUB_URL}/blob/main/CONTRIBUTING.md`;
export const GITHUB_DOCS_URL = `${GITHUB_URL}/blob/main/docs/INDEX.md`;

/** Forum URL when NodeBB is live; empty means use in-portal community hub. */
export function getCommunityHref(): string {
  const bbs = process.env.NEXT_PUBLIC_BBS_URL?.trim();
  if (!bbs || bbs.includes("localhost") || bbs.includes("bbs.keyantong.com")) {
    return "/community";
  }
  return bbs;
}

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? process.env.PUBLIC_PORTAL_URL ?? "https://keyantong.zeabur.app";
