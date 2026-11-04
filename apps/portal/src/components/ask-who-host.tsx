import { AskWho } from "@/components/ask-who";
import { currentUser } from "@/lib/user-session";

export async function AskWhoHost() {
  const user = await currentUser();
  return <AskWho loggedIn={Boolean(user)} />;
}
