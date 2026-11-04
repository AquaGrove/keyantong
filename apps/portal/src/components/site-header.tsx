import { SiteHeaderActions } from "@/components/site-header-actions";
import { getCommunityHref } from "@/lib/site";
import { currentUser } from "@/lib/user-session";

export async function SiteHeader() {
  const community = getCommunityHref();
  const user = await currentUser();
  return <SiteHeaderActions loggedIn={Boolean(user)} communityHref={community} />;
}
