import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            Cg
          </span>
          Chem Games
        </Link>
        <nav className="nav-links">
          <NavLink to="/discover">Discover</NavLink>
          <NavLink to="/saved">Saved</NavLink>
          <NavLink to="/classes">Classes</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {user ? (
            <button type="button" className="link-button" onClick={() => void logout()}>
              Logout
            </button>
          ) : (
            <>
              <NavLink to="/login">Login</NavLink>
              <NavLink to="/signup">Signup</NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
