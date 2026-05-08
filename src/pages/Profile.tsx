import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function Profile() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) {
        setFirstName("");
        setLastName("");
        return;
      }

      setLoadingProfile(true);
      setError("");

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setError(`Could not load profile: ${profileError.message}`);
      } else {
        setFirstName(data?.first_name ?? "");
        setLastName(data?.last_name ?? "");
      }

      setLoadingProfile(false);
    };

    void loadProfile();
  }, [user]);

  return (
    <main className="page">
      <div className="card">
        <h1>Profile</h1>

        {!user ? <p>You are not signed in.</p> : null}

        {user ? <p>Email: {user.email}</p> : null}
        {loadingProfile ? <p>Loading profile...</p> : null}
        {user && !loadingProfile ? <p>First Name: {firstName || "Not set"}</p> : null}
        {user && !loadingProfile ? <p>Last Name: {lastName || "Not set"}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </main>
  );
}
