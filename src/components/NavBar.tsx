import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          Chem Games
        </Link>
        <nav className="nav-links">
          <Link to="/discover">Discover</Link>
          <Link to="/saved">Saved</Link>
          <Link to="/profile">Profile</Link>
          {user ? (
            <button type="button" className="link-button" onClick={() => void logout()}>
              Logout
            </button>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link to="/signup">Signup</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
