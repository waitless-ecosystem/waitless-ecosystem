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

type Service = {
  id: string;
  name: string;
  prefix: string;
  averageServiceTime: number;
  status: string;
};

type Counter = {
  id: string;
  name: string;
  counterNumber: string;
  status: string;
  assignedStaffId?: string | null;
  assignedStaffEmail?: string | null;
  assignedStaffName?: string | null;
};

type StaffUser = {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  platformRole: string;
  status: string;
  organizationId: string;
  assignedCounterId?: string | null;
};

export default function AdminDashboardPage() {
  const { userProfile, logout } = useAuth();

  const organizationId = userProfile?.organizationId || "";

  const [services, setServices] = useState<Service[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [serviceName, setServiceName] = useState("");
  const [servicePrefix, setServicePrefix] = useState("");
  const [averageServiceTime, setAverageServiceTime] = useState(5);

  const [counterName, setCounterName] = useState("");
  const [counterNumber, setCounterNumber] = useState("");

  const [selectedCounterId, setSelectedCounterId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffCounterId, setStaffCounterId] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    const servicesQuery = query(
      collection(db, "organizations", organizationId, "services"),
      where("status", "==", "active"),
    );

    const countersQuery = query(
      collection(db, "organizations", organizationId, "counters"),
      where("status", "==", "active"),
    );

    const staffQuery = query(
      collection(db, "users"),
      where("organizationId", "==", organizationId),
      where("platformRole", "==", "staff"),
    );

    const unsubscribeServices = onSnapshot(servicesQuery, (snapshot) => {
      setServices(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Service[],
      );
    });

    const unsubscribeCounters = onSnapshot(countersQuery, (snapshot) => {
      setCounters(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Counter[],
      );
    });

    const unsubscribeStaff = onSnapshot(staffQuery, (snapshot) => {
      setStaffUsers(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as StaffUser[],
      );
    });

    return () => {
      unsubscribeServices();
      unsubscribeCounters();
      unsubscribeStaff();
    };
  }, [organizationId]);

  async function createService(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    try {
      await addDoc(
        collection(db, "organizations", organizationId, "services"),
        {
          name: serviceName.trim(),
          prefix: servicePrefix.trim().toUpperCase(),
          averageServiceTime,
          status: "active",
          createdAt: serverTimestamp(),
        },
      );

      setServiceName("");
      setServicePrefix("");
      setAverageServiceTime(5);
      setMessage("Service created.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not create service.");
    }
  }

  async function createCounter(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    try {
      await addDoc(
        collection(db, "organizations", organizationId, "counters"),
        {
          name: counterName.trim(),
          counterNumber: counterNumber.trim(),
          status: "active",
          currentTokenId: null,
          currentStepId: null,
          previousTokenId: null,
          assignedStaffId: null,
          assignedStaffEmail: null,
          assignedStaffName: null,
          createdAt: serverTimestamp(),
        },
      );

      setCounterName("");
      setCounterNumber("");
      setMessage("Counter created.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not create counter.");
    }
  }

  async function saveAssignments(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!organizationId) {
      setError("Organization ID is missing.");
      return;
    }

    if (!selectedCounterId) {
      setError("Please select a counter.");
      return;
    }

    if (selectedServiceIds.length === 0) {
      setError("Please select at least one service.");
      return;
    }

    try {
      for (const serviceId of selectedServiceIds) {
        await addDoc(
          collection(db, "organizations", organizationId, "serviceAssignments"),
          {
            counterId: selectedCounterId,
            serviceId,
            status: "active",
            createdAt: serverTimestamp(),
          },
        );
      }

      setSelectedCounterId("");
      setSelectedServiceIds([]);
      setMessage("Service assignments saved.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not save assignments.");
    }
  }

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

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }

  function getCounterLabel(counterId?: string | null) {
    if (!counterId) return "Not assigned";

    const counter = counters.find((item) => item.id === counterId);

    if (!counter) return counterId;

    return `${counter.name} (${counter.counterNumber})`;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Organization Admin Dashboard</h1>

      <p>Organization ID: {organizationId}</p>

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}
      >
        <Link to="/admin/services" style={navLink}>
          Manage Services
        </Link>
        <Link to="/admin/counters" style={navLink}>
          Manage Counters
        </Link>
        <Link to="/admin/assignments" style={navLink}>
          Assign Services
        </Link>
        <Link to="/admin/staff" style={navLink}>
          Assign Staff
        </Link>
      </div>

      <button onClick={logout}>Logout</button>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <section style={card}>
        <h2>1. Add Services</h2>

        <form onSubmit={createService}>
          <input
            required
            placeholder="Service name"
            value={serviceName}
            onChange={(event) => setServiceName(event.target.value)}
            style={input}
          />

          <input
            required
            placeholder="Prefix, example CD"
            value={servicePrefix}
            onChange={(event) => setServicePrefix(event.target.value)}
            style={input}
          />

          <input
            required
            type="number"
            min={1}
            value={averageServiceTime}
            onChange={(event) =>
              setAverageServiceTime(Number(event.target.value))
            }
            style={input}
          />

          <button type="submit">Add Service</button>
        </form>

        <ul>
          {services.map((service) => (
            <li key={service.id}>
              {service.name} ({service.prefix}) - {service.averageServiceTime}{" "}
              min
            </li>
          ))}
        </ul>
      </section>

      <section style={card}>
        <h2>2. Add Counters</h2>

        <form onSubmit={createCounter}>
          <input
            required
            placeholder="Counter name"
            value={counterName}
            onChange={(event) => setCounterName(event.target.value)}
            style={input}
          />

          <input
            required
            placeholder="Counter number, example C1"
            value={counterNumber}
            onChange={(event) => setCounterNumber(event.target.value)}
            style={input}
          />

          <button type="submit">Add Counter</button>
        </form>

        <ul>
          {counters.map((counter) => (
            <li key={counter.id}>
              {counter.name} ({counter.counterNumber}){" "}
              {counter.assignedStaffEmail
                ? `- Staff: ${counter.assignedStaffEmail}`
                : "- No staff assigned"}
            </li>
          ))}
        </ul>
      </section>

      <section style={card}>
        <h2>3. Assign Services to Counters</h2>

        <form onSubmit={saveAssignments}>
          <select
            required
            value={selectedCounterId}
            onChange={(event) => setSelectedCounterId(event.target.value)}
            style={input}
          >
            <option value="">Select counter</option>
            {counters.map((counter) => (
              <option key={counter.id} value={counter.id}>
                {counter.name} ({counter.counterNumber})
              </option>
            ))}
          </select>

          <div>
            {services.map((service) => (
              <label key={service.id} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={selectedServiceIds.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                />
                {service.name}
              </label>
            ))}
          </div>

          <button type="submit">Save Assignments</button>
        </form>
      </section>

      <section style={card}>
        <h2>4. Add Staff and Assign to Counter</h2>

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

        <h3>Staff Users</h3>

        {staffUsers.length === 0 ? (
          <p>No staff users created yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Assigned Counter</th>
                <th style={th}>Staff Dashboard</th>
              </tr>
            </thead>

            <tbody>
              {staffUsers.map((staff) => (
                <tr key={staff.uid}>
                  <td style={td}>{staff.displayName}</td>
                  <td style={td}>{staff.email}</td>
                  <td style={td}>{getCounterLabel(staff.assignedCounterId)}</td>
                  <td style={td}>
                    {staff.assignedCounterId ? (
                      <code>
                        /staff/{organizationId}/{staff.assignedCounterId}
                      </code>
                    ) : (
                      "Not assigned"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <h2>Useful Links</h2>
        <p>Kiosk URL: /kiosk/{organizationId}</p>

        <h3>Counter Display URLs</h3>
        {counters.map((counter) => (
          <p key={counter.id}>
            {counter.name}:{" "}
            <code>
              /display/{organizationId}/{counter.id}
            </code>
          </p>
        ))}

        <h3>Staff Counter URLs</h3>
        {staffUsers.map((staff) =>
          staff.assignedCounterId ? (
            <p key={staff.uid}>
              {staff.displayName}:{" "}
              <code>
                /staff/{organizationId}/{staff.assignedCounterId}
              </code>
            </p>
          ) : null,
        )}
      </section>
    </div>
  );
}

const card = {
  border: "1px solid #ddd",
  padding: 20,
  borderRadius: 8,
  marginTop: 24,
};

const navLink = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 18px",
  background: "#f4f6f8",
  color: "#111",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
};

const input = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 12,
};

const th = {
  textAlign: "left" as const,
  borderBottom: "1px solid #ddd",
  padding: 8,
};

const td = {
  borderBottom: "1px solid #eee",
  padding: 8,
};
