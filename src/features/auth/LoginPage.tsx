import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";

export default function LoginPage() {
  const {
    login,
    currentUser,
    userProfile,
    isSuperAdmin,
    isOrganizationAdmin,
    isStaff,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (currentUser && isSuperAdmin) {
    return <Navigate to="/superadmin" replace />;
  }

  if (currentUser && isOrganizationAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (currentUser && isStaff) {
    if (userProfile?.organizationId && userProfile.assignedCounterId) {
      return (
        <Navigate
          to={`/staff/${userProfile.organizationId}/${userProfile.assignedCounterId}`}
          replace
        />
      );
    }

    return (
      <div style={{ maxWidth: 600, margin: "80px auto", padding: 24 }}>
        <h1>No Counter Assigned</h1>
        <p>
          Your staff account is active, but no counter has been assigned to your
          profile. Please contact your organization administrator.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    try {
      await login(email, password);
    } catch (err) {
      console.error(err);
      setError("Login failed. Please check your email and password.");
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24 }}>
      <h1>Internal Login</h1>
      <p>This login is for superadmins, organization admins, and staff.</p>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        <button type="submit">Login</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
