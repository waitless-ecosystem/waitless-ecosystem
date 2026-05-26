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

import { db } from "../../firebase/firebase";
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
};

export default function AdminDashboardPage() {
  const { userProfile, logout } = useAuth();

  const organizationId = userProfile?.organizationId || "";

  const [services, setServices] = useState<Service[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);

  const [serviceName, setServiceName] = useState("");
  const [servicePrefix, setServicePrefix] = useState("");
  const [averageServiceTime, setAverageServiceTime] = useState(5);

  const [counterName, setCounterName] = useState("");
  const [counterNumber, setCounterNumber] = useState("");

  const [selectedCounterId, setSelectedCounterId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const [message, setMessage] = useState("");

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

    return () => {
      unsubscribeServices();
      unsubscribeCounters();
    };
  }, [organizationId]);

  async function createService(event: FormEvent) {
    event.preventDefault();

    await addDoc(collection(db, "organizations", organizationId, "services"), {
      name: serviceName,
      prefix: servicePrefix.toUpperCase(),
      averageServiceTime,
      status: "active",
      createdAt: serverTimestamp(),
    });

    setServiceName("");
    setServicePrefix("");
    setAverageServiceTime(5);
    setMessage("Service created.");
  }

  async function createCounter(event: FormEvent) {
    event.preventDefault();

    await addDoc(collection(db, "organizations", organizationId, "counters"), {
      name: counterName,
      counterNumber,
      status: "active",
      currentTokenId: null,
      currentStepId: null,
      previousTokenId: null,
      createdAt: serverTimestamp(),
    });

    setCounterName("");
    setCounterNumber("");
    setMessage("Counter created.");
  }

  async function saveAssignments(event: FormEvent) {
    event.preventDefault();

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
    setMessage("Assignments saved.");
  }

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Organization Admin Dashboard</h1>

      <p>Organization ID: {organizationId}</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Link to="/admin/services" style={linkCard}>
          Manage Services
        </Link>
        <Link to="/admin/counters" style={linkCard}>
          Manage Counters
        </Link>
        <Link to="/admin/assignments" style={linkCard}>
          Assign Services
        </Link>
      </div>

      <button onClick={logout}>Logout</button>

      {message && <p style={{ color: "green" }}>{message}</p>}

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
              {counter.name} ({counter.counterNumber})
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
        <h2>Useful Links</h2>
        <p>Kiosk URL: /kiosk/{organizationId}</p>
        <p>Counter display URL: /display/{organizationId}/COUNTER_ID</p>
        <p>Staff counter URL: /staff/{organizationId}/COUNTER_ID</p>
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

const input = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 12,
};

const linkCard = {
  padding: 12,
  background: "#f3f4f6",
  borderRadius: 8,
  textDecoration: "none",
  color: "#111",
  border: "1px solid #ddd",
};
