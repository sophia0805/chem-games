import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import ClassGameAssignments from "../components/ClassGameAssignments";
import ClassGameScores from "../components/ClassGameScores";
import StudentAssignmentScores from "../components/StudentAssignmentScores";
import { useGameAccess } from "../hooks/useGameAccess";
import { loadClassWorkspace, type ClassWorkspace } from "../lib/classWorkspace";

export default function ClassDetail() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { studentAssignments } = useGameAccess();
  const [workspace, setWorkspace] = useState<ClassWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!user || !classId) {
        setWorkspace(null);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const result = await loadClassWorkspace(classId, user.id);
        if (!result) {
          setWorkspace(null);
          setError("You do not have access to this class.");
        } else {
          setWorkspace(result);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Could not load class";
        setError(message);
        setWorkspace(null);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [user, classId]);

  if (!user) {
    return (
      <main className="page class-detail-page">
        <p>Please login to view this class.</p>
        <Link to="/login" className="button">
          Log in
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page class-detail-page">
        <p>Loading class...</p>
      </main>
    );
  }

  if (error || !workspace) {
    return (
      <main className="page class-detail-page">
        <p className="error">{error || "Class not found."}</p>
        <Link to="/classes" className="button">
          Back to My Classes
        </Link>
      </main>
    );
  }

  const { classInfo, membershipRole, canManage, roster } = workspace;
  const roleLabel = membershipRole ?? (canManage ? "teacher (owner)" : "member");
  const classAssignments = studentAssignments.filter(
    (assignment) => assignment.classId === classInfo.id
  );

  return (
    <main className="page class-detail-page">
      <Link to="/classes" className="class-detail-back">
        ← Back to My Classes
      </Link>
      <p className="eyebrow">Class workspace</p>
      <h1>{classInfo.name}</h1>
      <div className="class-detail-meta">
        <p>Role: {roleLabel}</p>
        <p>Status: {classInfo.is_active ? "Active" : "Inactive"}</p>
        <p>Join code: {classInfo.join_code}</p>
        {canManage ? <p>Students: {roster.length}</p> : null}
      </div>
      <div className="class-detail-panel">
        {!canManage && classAssignments.length > 0 ? (
          <StudentAssignmentScores assignments={classAssignments} userId={user.id} />
        ) : null}
        {canManage ? (
          <>
            <ClassGameAssignments classId={classInfo.id} teacherId={user.id} />
            <div className="class-roster">
              <h4 className="class-roster-title">Students in this class ({roster.length})</h4>
              {roster.length === 0 ? (
                <p className="class-roster-empty">No students have joined yet.</p>
              ) : (
                <ul className="class-roster-list">
                  {roster.map((student) => (
                    <li key={student.userId}>
                      <span className="class-roster-name">{student.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <ClassGameScores classId={classInfo.id} roster={roster} />
          </>
        ) : null}
      </div>
    </main>
  );
}
