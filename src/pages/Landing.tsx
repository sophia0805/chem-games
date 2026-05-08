import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Landing() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Welcome to Chem Games</h1>
      <p>Build your profile and discover new people.</p>
      <div className="row">
        {!user ? (
          <>
          <Link to="/signup" className="button">
              Create account
          </Link>
          <Link to="/login" className="button button-secondary">
            Log in
          </Link>
        </>
        ) : null}
      </div>
    </main>
  );
}
