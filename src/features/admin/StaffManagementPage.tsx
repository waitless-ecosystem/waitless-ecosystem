import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase/firebase";
import { useAuth } from "../auth/AuthProvider";

type Counter = {
  id: string;
  name: string;
  counterNumber: string;
};

type StaffUser = {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  assignedCounterId?: string | null;
};

export default function StaffManagementPage() {
  const { userProfile, logout } = useAuth();
  const organizationId = userProfile?.organizationId || "";

  const [counters, setCounters] = useState<Counter[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffCounterId, setStaffCounterId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    const countersQuery = query(
      collection(db, "organizations", organizationId, "counters"),
      where("status", "==", "active")
    );

    const staffQuery = query(
      collection(db, "users"),
      where("organizationId", "==", organizationId),
      where("platformRole", "==", "staff")
    );

    const unsubscribeCounters = onSnapshot(countersQuery, (snapshot) => {
      setCounters(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Counter[]
      );
    });

    const unsubscribeStaff = onSnapshot(staffQuery, (snapshot) => {
      setStaffUsers(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as StaffUser[]
      );
    });

    return () => {
      unsubscribeCounters();
      unsubscribeStaff();
    };
  }, [organizationId]);

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    if (!staffCounterId) {
      setError("Please select a counter for this staff member.");
      return;
    }

    try {
      const createStaffUser = httpsCallable(functions, "createStaffUser");

      const result: any = await createStaffUser({
        organizationId,
        counterId: staffCounterId,
        email: staffEmail.trim(),
        password: staffPassword,
        displayName: staffName.trim(),
      });

      setStaffName("");
      setStaffEmail("");
      setStaffPassword("");
      setStaffCounterId("");

      setMessage(
        `Staff created. Email: ${result.data.staffEmail}. Assigned counter ID: ${result.data.assignedCounterId}`
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not create staff user.");
    }
  }

  function getCounterLabel(counterId?: string | null) {
    if (!counterId) return "Not assigned";
    const counter = counters.find((item) => item.id === counterId);
    if (!counter) return counterId;
    return `${counter.name} (${counter.counterNumber})`;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Staff Management</h1>
          <p>Create and assign staff to counters.</p>
        </div>
        <button onClick={logout} style={button}>
          Logout
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <Link to="/admin" style={linkButton}>
          Back to Organization Admin Dashboard
        </Link>
      </div>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={card}>
        <h2>Add Staff and Assign to Counter</h2>

        <form onSubmit={createStaff}>
          <input
            required
            placeholder="Staff name"
            value={staffName}
            onChange={(event) => setStaffName(event.target.value)}
            style={input}
          />

          <input
            required
            type="email"
            placeholder="Staff email"
            value={staffEmail}
            onChange={(event) => setStaffEmail(event.target.value)}
            style={input}
          />

          <input
            required
            type="password"
            placeholder="Temporary staff password"
            value={staffPassword}
            onChange={(event) => setStaffPassword(event.target.value)}
            style={input}
          />

          <select
            required
            value={staffCounterId}
            onChange={(event) => setStaffCounterId(event.target.value)}
            style={input}
          >
            <option value="">Select assigned counter</option>
            {counters.map((counter) => (
              <option key={counter.id} value={counter.id}>
                {counter.name} ({counter.counterNumber})
              </option>
            ))}
          </select>

          <button type="submit">Create Staff and Assign Counter</button>
        </form>
      </section>

      <section style={card}>
        <h2>Staff Users</h2>
        {staffUsers.length === 0 ? (
          <p>No staff users created yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Assigned Counter</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.map((staff) => (
                <tr key={staff.uid}>
                  <td style={td}>{staff.displayName}</td>
                  <td style={td}>{staff.email}</td>
                  <td style={td}>{getCounterLabel(staff.assignedCounterId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const card = {
  border: "1px solid #ddd",
  padding: 20,
  borderRadius: 8,
  marginBottom: 24,
};

const input = {
  display: "block",
  width: "100%",
  marginBottom: 12,
  padding: 10,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const button = {
  background: "#0066ff",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
};

const linkButton = {
  display: "inline-block",
  background: "#f5f5f5",
  color: "#333",
  padding: "10px 16px",
  borderRadius: 8,
  textDecoration: "none",
};

const th = {
  textAlign: "left" as const,
  padding: 10,
  borderBottom: "1px solid #ddd",
};

const td = {
  padding: 10,
  borderBottom: "1px solid #eee",
};
