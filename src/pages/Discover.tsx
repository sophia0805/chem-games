import { useAuth } from "../context/AuthContext";

export default function Discover() {
  const { user } = useAuth();

  return (
    <main className="page page-narrow">
      <p className="eyebrow">Reaction feed</p>
      <h1>Discover</h1>
      <p className="lead">
        {user ? `Signed in as ${user.email}` : "Sign in to personalize discover."}
      </p>
    </main>
  );
}
