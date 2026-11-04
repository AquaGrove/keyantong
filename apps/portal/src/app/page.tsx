import { HomeDispatcher } from "@/components/home-dispatcher";
import { HomeIntro } from "@/components/home-intro";
import { WorkerManager } from "@/components/worker-manager";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  const entitled = user ? isEntitled(user) : false;

  return (
    <main className="page page-home">
      <HomeIntro />
      <HomeDispatcher loggedIn={Boolean(user)} entitled={entitled} />
      <WorkerManager loggedIn={Boolean(user)} />
    </main>
  );
}
