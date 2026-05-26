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
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Organization admin</div>
        <h1 className="page-title">Organization Admin Dashboard</h1>
        <p className="page-subtitle">Organization ID: {organizationId}</p>
      </section>

      <div className="action-group" style={{ marginBottom: 24 }}>
        <Link to="/admin/services" className="secondary-btn">
          Manage Services
        </Link>
        <Link to="/admin/counters" className="secondary-btn">
          Manage Counters
        </Link>
        <Link to="/admin/assignments" className="secondary-btn">
          Assign Services
        </Link>
        <Link to="/admin/staff" className="secondary-btn">
          Assign Staff
        </Link>
        <button type="button" className="nav-button" onClick={logout}>
          Logout
        </button>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      <section className="page-card">
        <h2>1. Add Services</h2>

        <form className="form-grid" onSubmit={createService}>
          <label>
            Service name
            <input
              required
              placeholder="Service name"
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
            />
          </label>

          <label>
            Prefix
            <input
              required
              placeholder="Prefix, example CD"
              value={servicePrefix}
              onChange={(event) => setServicePrefix(event.target.value)}
            />
          </label>

          <label>
            Average time (minutes)
            <input
              required
              type="number"
              min={1}
              value={averageServiceTime}
              onChange={(event) =>
                setAverageServiceTime(Number(event.target.value))
              }
            />
          </label>

          <button className="primary-btn" type="submit">
            Add Service
          </button>
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

      <section className="page-card">
        <h2>2. Add Counters</h2>

        <form className="form-grid" onSubmit={createCounter}>
          <label>
            Counter name
            <input
              required
              placeholder="Counter name"
              value={counterName}
              onChange={(event) => setCounterName(event.target.value)}
            />
          </label>

          <label>
            Counter number
            <input
              required
              placeholder="Counter number, example C1"
              value={counterNumber}
              onChange={(event) => setCounterNumber(event.target.value)}
            />
          </label>

          <button className="primary-btn" type="submit">
            Add Counter
          </button>
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

      <section className="page-card">
        <h2>3. Assign Services to Counters</h2>

        <form className="form-grid" onSubmit={saveAssignments}>
          <label>
            Select counter
            <select
              required
              value={selectedCounterId}
              onChange={(event) => setSelectedCounterId(event.target.value)}
            >
              <option value="">Select counter</option>
              {counters.map((counter) => (
                <option key={counter.id} value={counter.id}>
                  {counter.name} ({counter.counterNumber})
                </option>
              ))}
            </select>
          </label>

          <div className="page-card" style={{ padding: 20 }}>
            <h3>Choose services</h3>
            <div className="content-grid-2">
              {services.map((service) => (
                <label
                  key={service.id}
                  className="section-card"
                  style={{ cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedServiceIds.includes(service.id)}
                    onChange={() => toggleService(service.id)}
                    style={{ marginRight: 8 }}
                  />
                  {service.name}
                </label>
              ))}
            </div>
          </div>

          <button className="primary-btn" type="submit">
            Save Assignments
          </button>
        </form>
      </section>

      <section className="page-card">
        <h2>4. Add Staff and Assign to Counter</h2>

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
            Temporary staff password
            <input
              required
              type="password"
              placeholder="Temporary staff password"
              value={staffPassword}
              onChange={(event) => setStaffPassword(event.target.value)}
            />
          </label>

          <label>
            Select assigned counter
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

        <h3>Staff Users</h3>

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
                  <th>Staff Dashboard</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((staff) => (
                  <tr key={staff.uid}>
                    <td>{staff.displayName}</td>
                    <td>{staff.email}</td>
                    <td>{getCounterLabel(staff.assignedCounterId)}</td>
                    <td>
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
          </div>
        )}
      </section>

      <section className="page-card" style={{ marginTop: 24 }}>
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
    </main>
  );
}
