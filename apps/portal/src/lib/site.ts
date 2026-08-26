export { getCommunityHref } from "@keyantong/ops-shared";

import {
  getGithubContributingUrl,
  getGithubDiscussionsUrl,
  getGithubDocsUrl,
  getGithubIssuesUrl,
  getGithubOwner,
  getGithubRepo,
  getGithubRepoFull,
  getGithubUrl,
  getSiteUrl,
} from "@keyantong/ops-shared";

export const GITHUB_OWNER = getGithubOwner();
export const GITHUB_REPO = getGithubRepo();
export const GITHUB_REPO_FULL = getGithubRepoFull();
export const GITHUB_URL = getGithubUrl();
export const GITHUB_DISCUSSIONS_URL = getGithubDiscussionsUrl();
export const GITHUB_ISSUES_URL = getGithubIssuesUrl();
export const GITHUB_CONTRIBUTING_URL = getGithubContributingUrl();
export const GITHUB_DOCS_URL = getGithubDocsUrl();
export const SITE_URL = getSiteUrl();
