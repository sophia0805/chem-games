import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Landing() {
  const { user } = useAuth();

  return (
    <main className="page hero">
      <section className="hero-copy" aria-labelledby="home-title">
        <p className="eyebrow">Green chemistry learning lab</p>
        <h1 id="home-title">Chem Games</h1>
        <p className="lead">
          Practice chemistry through class challenges, saved activities, and quick
          teacher-led join codes.
        </p>
        <div className="hero-actions">
          {user ? (
            <Link to="/classes" className="button">
              Open Classes
            </Link>
          ) : (
            <>
              <Link to="/signup" className="button">
                Create account
              </Link>
              <Link to="/login" className="button button-secondary">
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="hero-panel" aria-label="Chemistry dashboard preview">
        <div className="lab-card">
          <div className="molecule" aria-hidden="true">
            <span>H</span>
            <span>O</span>
            <span>Na</span>
          </div>
          <div className="lab-stats">
            <div className="stat">
              <strong>pH 7</strong>
              <span>Balanced</span>
            </div>
            <div className="stat">
              <strong>6C</strong>
              <span>Class Code</span>
            </div>
            <div className="stat">
              <strong>100%</strong>
              <span>Curious</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
