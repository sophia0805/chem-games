import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchTeacherRosters, loadClassCards, type ClassCard } from "../lib/classWorkspace";
import { supabase } from "../lib/supabaseClient";

export default function MyClasses() {
  const { user } = useAuth();
  const [classCards, setClassCards] = useState<ClassCard[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [accountRole, setAccountRole] = useState<"teacher" | "student" | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");

  useEffect(() => {
    const loadClasses = async () => {
      if (!user) {
        setClassCards([]);
        setStudentCounts({});
        setRosterError("");
        setAccountRole("");
        return;
      }

      setLoading(true);
      setError("");
      setRosterError("");

      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(`Could not load profile role: ${profileError.message}`);
        }

        setAccountRole((profileData?.role as "teacher" | "student" | null) ?? "");

        const cards = await loadClassCards(user.id);
        setClassCards(cards);

        const teacherClassIds = cards
          .filter((card) => card.canManage)
          .map((card) => card.classInfo.id);

        if (teacherClassIds.length === 0) {
          setStudentCounts({});
        } else {
          const { grouped, error: rosterErr } = await fetchTeacherRosters(
            supabase,
            teacherClassIds
          );
          if (rosterErr) {
            setRosterError(rosterErr);
            setStudentCounts({});
          } else {
            const counts: Record<string, number> = {};
            for (const id of teacherClassIds) {
              counts[id] = grouped[id]?.length ?? 0;
            }
            setStudentCounts(counts);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Could not load classes";
        setError(message);
        setClassCards([]);
        setStudentCounts({});
      } finally {
        setLoading(false);
      }
    };

    void loadClasses();
  }, [user]);

  const hasTeacherClasses = classCards.some((card) => card.canManage);

  return (
    <main className="page">
      <p className="eyebrow">Class workspace</p>
      <h1>My Classes</h1>

      {!user ? <p>Please login to view your classes.</p> : null}

      {user ? (
        <div className="actions-row">
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

      {user && accountRole === "teacher" && !hasTeacherClasses && !loading ? (
        <p className="class-assignments-hint">
          Create a class below, then open it to assign games and view scores.
        </p>
      ) : null}

      {loading ? <p>Loading classes...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {rosterError ? <p className="error">{rosterError}</p> : null}

      {!loading && user && classCards.length === 0 ? (
        <p className="empty-state">No classes yet. Create one or join with a code.</p>
      ) : null}

      <div className="class-grid">
        {classCards.map((card) => {
          const { classInfo, membershipRole, canManage } = card;
          const studentCount = studentCounts[classInfo.id] ?? 0;
          const roleLabel = membershipRole ?? (canManage ? "teacher (owner)" : "member");

          return (
            <Link
              key={classInfo.id}
              to={`/classes/${classInfo.id}`}
              className="class-item class-item-link"
            >
              <span className="class-item-title">{classInfo.name}</span>
              <span className="class-item-meta">
                {roleLabel}
                {" · "}
                {classInfo.is_active ? "Active" : "Inactive"}
                {canManage ? ` · ${studentCount} student${studentCount === 1 ? "" : "s"}` : ""}
              </span>
              <span className="class-item-meta">Join code: {classInfo.join_code}</span>
              <span className="class-item-open">Open class →</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
