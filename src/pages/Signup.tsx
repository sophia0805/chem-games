import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setWarningMessage("");
    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!data.user) {
        throw new Error("No user was returned from Supabase.");
      }

      let session = data.session;

      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError && !signInError.message.toLowerCase().includes("email not confirmed")) {
          throw signInError;
        }

        session = signInData.session;
      }

      if (session) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          first_name: firstName,
          last_name: lastName,
        });

        if (profileError) {
          // Auth signup can still succeed even if profile persistence fails.
          setWarningMessage(
            `Your account was created, but we could not save your profile details yet: ${profileError.message}`
          );
        }

        login(session);
        navigate("/discover");
        return;
      }

      setSuccessMessage("Check your email to verify your account, then log in.");
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "Signup failed";
      const message = rawMessage.toLowerCase().includes("email rate limit exceeded")
        ? "Too many signup attempts right now. Please wait a minute, then try again."
        : rawMessage;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="card">
        <h1>Create account</h1>
        <form className="form" onSubmit={handleSignup}>
          <label htmlFor="firstName">First Name</label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />

          <label htmlFor="lastName">Last Name</label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />

          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error ? <p className="error">{error}</p> : null}
          {warningMessage ? <p className="error">{warningMessage}</p> : null}
          {successMessage ? <p className="success">{successMessage}</p> : null}

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>
        <p>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </main>
  );
}
