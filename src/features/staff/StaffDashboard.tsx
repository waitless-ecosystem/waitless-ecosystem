import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function StaffDashboard() {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return <p style={{ padding: 24 }}>Loading staff dashboard...</p>;
  }

  if (!userProfile) {
    return (
      <div style={{ padding: 24 }}>
        <p>You must be signed in to access the staff dashboard.</p>
      </div>
    );
  }

  if (userProfile.platformRole !== "staff") {
    return (
      <div style={{ padding: 24 }}>
        <p>This page is only available to staff users.</p>
      </div>
    );
  }

  if (!userProfile.organizationId || !userProfile.assignedCounterId) {
    return (
      <div style={{ padding: 24 }}>
        <p>Staff member is not assigned to a counter yet.</p>
        <p>Contact your administrator for assistance.</p>
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
