import { HomeDispatcher } from "@/components/home-dispatcher";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { HomeIntro } from "@/components/home-intro";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  const entitled = user ? isEntitled(user) : false;

  return (
    <main className="page page-home">
      <HomeIntro />
      <HomeDispatcher loggedIn={Boolean(user)} entitled={entitled} />
    </main>
  );
}
