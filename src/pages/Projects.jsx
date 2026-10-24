import { signOutSession } from "../auth/session.js";
import Button from "../components/ui/Button.jsx";

// Placeholder until M2.1 builds the dashboard.
export default function Projects() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Projects</h1>
      <Button variant="secondary" className="mt-4" onClick={() => signOutSession()}>
        Sign out
      </Button>
    </main>
  );
}
