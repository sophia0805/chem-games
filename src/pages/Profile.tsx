import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Profile</h1>
      <p>{user ? user.email : "You are not signed in."}</p>
    </main>
  );
}
