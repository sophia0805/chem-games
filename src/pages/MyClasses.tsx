import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

type MembershipRow = {
  role: "teacher" | "student";
  classes:
    | {
    id: string;
    name: string;
    join_code: string;
    teacher_id: string;
    is_active: boolean;
    created_at: string;
      }
    | Array<{
        id: string;
        name: string;
        join_code: string;
        teacher_id: string;
        is_active: boolean;
        created_at: string;
      }>
    | null;
};

export default function MyClasses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [accountRole, setAccountRole] = useState<"teacher" | "student" | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadClasses = async () => {
      if (!user) {
        setRows([]);
        return;
      }

      setLoading(true);
      setError("");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setError(`Could not load profile role: ${profileError.message}`);
        setLoading(false);
        return;
      }

      setAccountRole((profileData?.role as "teacher" | "student" | null) ?? "");

      const { data, error: queryError } = await supabase
        .from("class_memberships")
        .select(
          "role, classes(id, name, join_code, teacher_id, is_active, created_at)"
        )
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });

      if (queryError) {
        setError(`Could not load classes: ${queryError.message}`);
      } else {
        setRows((data as MembershipRow[]) ?? []);
      }

      setLoading(false);
    };

    void loadClasses();
  }, [user]);

  return (
    <main className="page">
      <h1>My Classes</h1>

      {!user ? <p>Please login to view your classes.</p> : null}

      {user ? (
        <div className="row" style={{ marginBottom: "16px" }}>
          {accountRole !== "student" ? (
            <Link className="button" to="/classes/create">
              Create Class
            </Link>
          ) : null}
          {accountRole !== "teacher" ? (
            <Link className="button button-secondary" to="/classes/join">
              Join Class
            </Link>
          ) : null}
        </div>
      ) : null}

      {loading ? <p>Loading classes...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && user && rows.length === 0 ? (
        <p>No classes yet. Create one or join with a code.</p>
      ) : null}

      <div className="class-grid">
        {rows.map((row) => {
          const linkedClass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
          if (!linkedClass) {
            return null;
          }

          return (
            <div className="class-item" key={linkedClass.id}>
              <h3>{linkedClass.name}</h3>
              <p>Role: {row.role}</p>
              <p>Status: {linkedClass.is_active ? "Active" : "Inactive"}</p>
              <p>Join code: {linkedClass.join_code}</p>
            </div>
          );
        })}
      </div>
    </main>
  );
}
