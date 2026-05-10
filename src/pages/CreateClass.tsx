import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_RETRIES = 5;

function generateJoinCode() {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  ).join("");
}

export default function CreateClass() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateClass = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setCreatedCode("");

    if (!user) {
      setError("You must be signed in to create a class.");
      return;
    }

    setLoading(true);

    try {
      let classId = "";
      let joinCode = "";

      for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
        joinCode = generateJoinCode();
        const { data, error: classError } = await supabase
          .from("classes")
          .insert({
            name: name.trim(),
            teacher_id: user.id,
            join_code: joinCode,
          })
          .select("id, join_code")
          .single();

        if (!classError) {
          classId = data.id;
          joinCode = data.join_code;
          break;
        }

        if (classError.code !== "23505") {
          throw classError;
        }
      }

      if (!classId) {
        throw new Error("Could not generate a unique class code. Please try again.");
      }

      const { error: membershipError } = await supabase
        .from("class_memberships")
        .insert({
          class_id: classId,
          user_id: user.id,
          role: "teacher",
        });

      if (membershipError) {
        throw membershipError;
      }

      setCreatedCode(joinCode);
      setName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create class");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="card">
        <h1>Create Class</h1>
        <p>Create a class and share the generated join code with students.</p>

        {!user ? (
          <p>
            Please <Link to="/login">login</Link> first.
          </p>
        ) : (
          <form className="form" onSubmit={handleCreateClass}>
            <label htmlFor="class-name">Class Name</label>
            <input
              id="class-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Example: Chem 101 - Period 2"
              minLength={2}
              required
            />

            {error ? <p className="error">{error}</p> : null}
            {createdCode ? (
              <p className="success">
                Class created. Join code: <strong>{createdCode}</strong>
              </p>
            ) : null}

            <div className="row">
              <button className="button" type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Class"}
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
