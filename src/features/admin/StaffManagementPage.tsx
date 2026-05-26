import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
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
      where("status", "==", "active"),
    );

    const staffQuery = query(
      collection(db, "users"),
      where("organizationId", "==", organizationId),
      where("platformRole", "==", "staff"),
    );

    const unsubscribeCounters = onSnapshot(countersQuery, (snapshot) => {
      setCounters(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Counter[],
      );
    });

    const unsubscribeStaff = onSnapshot(staffQuery, (snapshot) => {
      setStaffUsers(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as StaffUser[],
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
        `Staff created. Email: ${result.data.staffEmail}. Assigned counter ID: ${result.data.assignedCounterId}`,
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
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Staff operations</div>
        <h1 className="page-title">Staff Management</h1>
        <p className="page-subtitle">Create and assign staff to counters.</p>
      </section>

      <div className="action-group" style={{ marginBottom: 24 }}>
        <button type="button" className="nav-button" onClick={logout}>
          Logout
        </button>
        <Link to="/admin" className="secondary-btn">
          Back to Organization Admin Dashboard
        </Link>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      <section className="page-card">
        <h2>Add Staff and Assign to Counter</h2>
        <form className="form-grid" onSubmit={createStaff}>
          <label>
            Staff name
            <input
              required
              placeholder="Staff name"
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
            />
          </label>

          <label>
            Staff email
            <input
              required
              type="email"
              placeholder="Staff email"
              value={staffEmail}
              onChange={(event) => setStaffEmail(event.target.value)}
            />
          </label>

          <label>
            Temporary password
            <input
              required
              type="password"
              placeholder="Temporary staff password"
              value={staffPassword}
              onChange={(event) => setStaffPassword(event.target.value)}
            />
          </label>

          <label>
            Assigned counter
            <select
              required
              value={staffCounterId}
              onChange={(event) => setStaffCounterId(event.target.value)}
            >
              <option value="">Select assigned counter</option>
              {counters.map((counter) => (
                <option key={counter.id} value={counter.id}>
                  {counter.name} ({counter.counterNumber})
                </option>
              ))}
            </select>
          </label>

          <button className="primary-btn" type="submit">
            Create Staff and Assign Counter
          </button>
        </form>
      </section>

      <section className="page-card" style={{ marginTop: 24 }}>
        <h2>Staff Users</h2>
        {staffUsers.length === 0 ? (
          <p>No staff users created yet.</p>
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Assigned Counter</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((staff) => (
                  <tr key={staff.uid}>
                    <td>{staff.displayName}</td>
                    <td>{staff.email}</td>
                    <td>{getCounterLabel(staff.assignedCounterId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
