import Link from "next/link";
import { SiteHeaderActions } from "@/components/site-header-actions";
import { getCommunityHref } from "@/lib/site";
import { currentUser } from "@/lib/user-session";

export async function SiteHeader() {
  const community = getCommunityHref();
  const user = await currentUser();

  return (
    <header className="site-header">
      <Link href="/" className="logo" aria-label="KeyanTong home">
        <span className="logo-mark" aria-hidden />
        <span className="logo-text">科研通</span>
      </Link>
      <SiteHeaderActions loggedIn={Boolean(user)} communityHref={community} />
    </header>
  );
}
