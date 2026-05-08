import { useAuth } from "../context/AuthContext";

export default function Discover() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Discover</h1>
      <p>{user ? `Signed in as ${user.email}` : "Sign in to personalize discover."}</p>
    </main>
  );
}
