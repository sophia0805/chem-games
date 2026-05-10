import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function JoinClass() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoinClass = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!user) {
      setError("You must be signed in to join a class.");
      return;
    }

    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError("Please enter a class code.");
      return;
    }

    setLoading(true);
    try {
      const { data: foundClass, error: classError } = await supabase
        .from("classes")
        .select("id, name, is_active")
        .eq("join_code", normalizedCode)
        .maybeSingle();

      if (classError) {
        throw classError;
      }

      if (!foundClass) {
        setError("Invalid class code.");
        return;
      }

      if (!foundClass.is_active) {
        setError("This class is not active.");
        return;
      }

      const { error: membershipError } = await supabase
        .from("class_memberships")
        .insert({
          class_id: foundClass.id,
          user_id: user.id,
          role: "student",
        });

      if (membershipError?.code === "23505") {
        setError("You are already a member of this class.");
        return;
      }

      if (membershipError) {
        throw membershipError;
      }

      setSuccess(`Joined ${foundClass.name} successfully.`);
      setJoinCode("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not join class");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="card">
        <h1>Join Class</h1>
        <p>Enter your teacher&apos;s class code to join.</p>

        {!user ? (
          <p>
            Please <Link to="/login">login</Link> first.
          </p>
        ) : (
          <form className="form" onSubmit={handleJoinClass}>
            <label htmlFor="join-code">Class Code</label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD23"
              maxLength={12}
              required
            />

            {error ? <p className="error">{error}</p> : null}
            {success ? <p className="success">{success}</p> : null}

            <div className="row">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Joining..." : "Join Class"}
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => navigate("/classes")}
              >
                Back to Classes
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
