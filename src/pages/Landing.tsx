import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main className="page">
      <h1>Welcome to Chem Games</h1>
      <p>Build your profile and discover new people.</p>
      <div className="row">
        <Link to="/signup" className="button">
          Create account
        </Link>
        <Link to="/login" className="button button-secondary">
          Log in
        </Link>
      </div>
    </main>
  );
}
