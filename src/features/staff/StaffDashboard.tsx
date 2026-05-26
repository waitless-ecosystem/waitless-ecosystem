import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function StaffDashboard() {
  const { currentUser, userProfile, loading, logout } = useAuth();

  if (loading) {
    return <p style={{ padding: 24 }}>Loading staff dashboard...</p>;
  }

  if (!currentUser) {
    return <Navigate to="/internal-login" replace />;
  }

  if (!userProfile) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Staff Profile Missing</h1>
        <p>You are logged in, but no Firestore user profile was found.</p>
        <p>Expected Firestore document:</p>
        <pre>users/{currentUser.uid}</pre>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  if (userProfile.platformRole !== "staff") {
    return (
      <div style={{ padding: 24 }}>
        <h1>Not a Staff Account</h1>
        <p>This page is only available to staff users.</p>
        <p>Your role: {userProfile.platformRole}</p>
        <p>Your status: {userProfile.status}</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  if (userProfile.status !== "active") {
    return (
      <div style={{ padding: 24 }}>
        <h1>Staff Account Not Active</h1>
        <p>Your staff account status is: {userProfile.status}</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  if (!userProfile.organizationId || !userProfile.assignedCounterId) {
    return (
      <div style={{ padding: 24 }}>
        <h1>No Counter Assigned</h1>
        <p>
          Your staff account is active, but it is not assigned to a counter.
        </p>

        <p>Required fields:</p>
        <pre>
          {`organizationId: ${userProfile.organizationId || "missing"}
assignedCounterId: ${userProfile.assignedCounterId || "missing"}`}
        </pre>

        <p>
          Please ask the organization administrator to assign you to a counter.
        </p>

        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <Navigate
      to={`/staff/${userProfile.organizationId}/${userProfile.assignedCounterId}`}
      replace
    />
  );
}
