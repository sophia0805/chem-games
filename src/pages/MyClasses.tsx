import type { SupabaseClient } from "@supabase/supabase-js";
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

function getLinkedClass(row: MembershipRow) {
  return Array.isArray(row.classes) ? row.classes[0] : row.classes;
}

type ProfileSnippet = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type RosterMembershipRow = {
  class_id: string;
  user_id: string;
  joined_at: string;
};

type RosterStudent = {
  userId: string;
  joinedAt: string;
  displayName: string;
};

function displayNameFromProfile(p: ProfileSnippet | null | undefined): string {
  if (!p) {
    return "Student";
  }
  const full = [p.first_name, p.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return full || "Student";
}

function isTeacherForClass(
  row: MembershipRow,
  linkedClass: NonNullable<ReturnType<typeof getLinkedClass>>,
  userId: string
) {
  return row.role === "teacher" || linkedClass.teacher_id === userId;
}

type RpcRosterRow = {
  class_id: string;
  user_id: string;
  joined_at: string;
  first_name: string | null;
  last_name: string | null;
};

function isMissingRpcError(err: { code?: string; message?: string } | null): boolean {
  if (!err) {
    return false;
  }
  const msg = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("does not exist")
  );
}

async function fetchTeacherRosters(
  client: SupabaseClient,
  teacherClassIds: string[]
): Promise<{ grouped: Record<string, RosterStudent[]>; error: string }> {
  if (teacherClassIds.length === 0) {
    return { grouped: {}, error: "" };
  }

  const { data: rpcData, error: rpcError } = await client.rpc("get_teacher_class_rosters");

  if (!rpcError && Array.isArray(rpcData)) {
    const grouped: Record<string, RosterStudent[]> = {};
    for (const row of rpcData as RpcRosterRow[]) {
      const cid = String(row.class_id);
      const list = grouped[cid] ?? [];
      list.push({
        userId: String(row.user_id),
        joinedAt: row.joined_at,
        displayName: displayNameFromProfile({
          id: String(row.user_id),
          first_name: row.first_name,
          last_name: row.last_name,
        }),
      });
      grouped[cid] = list;
    }
    return { grouped, error: "" };
  }

  if (rpcError && !isMissingRpcError(rpcError)) {
    return {
      grouped: {},
      error: `Could not load student lists: ${rpcError.message}`,
    };
  }

  const { data: rosterData, error: rosterQueryError } = await client
    .from("class_memberships")
    .select("class_id, user_id, joined_at")
    .in("class_id", teacherClassIds)
    .eq("role", "student")
    .order("joined_at", { ascending: true });

  if (rosterQueryError) {
    return {
      grouped: {},
      error: `Could not load student lists: ${rosterQueryError.message}`,
    };
  }

  const memberships = (rosterData as RosterMembershipRow[]) ?? [];
  const studentIds = [...new Set(memberships.map((m) => m.user_id))];

  const profileById = new Map<string, ProfileSnippet>();
  if (studentIds.length > 0) {
    const { data: profilesData, error: profilesError } = await client
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", studentIds);

    if (profilesError) {
      return {
        grouped: {},
        error: `Could not load student lists: ${profilesError.message}`,
      };
    }
    for (const row of (profilesData as ProfileSnippet[]) ?? []) {
      profileById.set(row.id, row);
    }
  }

  const grouped: Record<string, RosterStudent[]> = {};
  for (const r of memberships) {
    const list = grouped[r.class_id] ?? [];
    list.push({
      userId: r.user_id,
      joinedAt: r.joined_at,
      displayName: displayNameFromProfile(profileById.get(r.user_id)),
    });
    grouped[r.class_id] = list;
  }
  return { grouped, error: "" };
}

export default function MyClasses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterStudent[]>>({});
  const [accountRole, setAccountRole] = useState<"teacher" | "student" | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState("");

  useEffect(() => {
    const loadClasses = async () => {
      if (!user) {
        setRows([]);
        setRosters({});
        setRosterError("");
        setAccountRole("");
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
        setRows([]);
        setRosters({});
        setRosterError("");
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
        setRows([]);
        setRosters({});
        setRosterError("");
        setLoading(false);
        return;
      }

      const membershipRows = (data as MembershipRow[]) ?? [];
      setRows(membershipRows);

      const teacherClassIds = [
        ...new Set(
          membershipRows
            .map((row) => {
              const linkedClass = getLinkedClass(row);
              if (!linkedClass || !user) {
                return null;
              }
              return isTeacherForClass(row, linkedClass, user.id) ? linkedClass.id : null;
            })
            .filter((id): id is string => Boolean(id))
        ),
      ];

      setRosterError("");

      if (teacherClassIds.length === 0) {
        setRosters({});
      } else {
        const { grouped, error: rosterErr } = await fetchTeacherRosters(
          supabase,
          teacherClassIds
        );
        if (rosterErr) {
          setRosterError(rosterErr);
          setRosters({});
        } else {
          setRosters(grouped);
        }
      }

      setLoading(false);
    };

    void loadClasses();
  }, [user]);

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

      {loading ? <p>Loading classes...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {rosterError ? <p className="error">{rosterError}</p> : null}

      {!loading && user && rows.length === 0 ? (
        <p className="empty-state">No classes yet. Create one or join with a code.</p>
      ) : null}

      <div className="class-grid">
        {rows.map((row) => {
          const linkedClass = getLinkedClass(row);
          if (!linkedClass) {
            return null;
          }

          const showRoster =
            user && isTeacherForClass(row, linkedClass, user.id);
          const roster = rosters[linkedClass.id] ?? [];

          return (
            <div className="class-item" key={linkedClass.id}>
              <h3>{linkedClass.name}</h3>
              <p>Role: {row.role}</p>
              <p>Status: {linkedClass.is_active ? "Active" : "Inactive"}</p>
              <p>Join code: {linkedClass.join_code}</p>
              {showRoster ? (
                <div className="class-roster">
                  <h4 className="class-roster-title">
                    Students in this class ({roster.length})
                  </h4>
                  {roster.length === 0 ? (
                    <p className="class-roster-empty">No students have joined yet.</p>
                  ) : (
                    <ul className="class-roster-list">
                      {roster.map((s) => (
                        <li key={s.userId}>
                          <span className="class-roster-name">{s.displayName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}
