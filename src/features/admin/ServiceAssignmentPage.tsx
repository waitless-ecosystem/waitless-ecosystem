import { FormEvent, useEffect, useState } from "react";
import { collection, onSnapshot, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../../firebase/firebase";

type OptionItem = {
  id: string;
  name: string;
  prefix?: string;
  counterNumber?: string;
};

type Assignment = {
  id: string;
  serviceId: string;
  counterId: string;
};

export default function ServiceAssignmentPage() {
  const { userProfile } = useAuth();
  const organizationId = userProfile?.organizationId;

  const [services, setServices] = useState<OptionItem[]>([]);
  const [counters, setCounters] = useState<OptionItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    const serviceQuery = query(
      collection(db, "organizations", organizationId, "services"),
      where("status", "==", "active"),
    );
    const counterQuery = query(
      collection(db, "organizations", organizationId, "counters"),
      where("status", "==", "active"),
    );
    const assignmentQuery = query(
      collection(db, "organizations", organizationId, "serviceAssignments"),
      where("status", "==", "active"),
    );

    const unsubscribeServices = onSnapshot(serviceQuery, (snapshot) => {
      setServices(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as OptionItem[],
      );
    });

    const unsubscribeCounters = onSnapshot(counterQuery, (snapshot) => {
      setCounters(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as OptionItem[],
      );
    });

    const unsubscribeAssignments = onSnapshot(assignmentQuery, (snapshot) => {
      setAssignments(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Assignment[],
      );
    });

    return () => {
      unsubscribeServices();
      unsubscribeCounters();
      unsubscribeAssignments();
    };
  }, [organizationId]);

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!organizationId) return;

    await addDoc(collection(db, "organizations", organizationId, "serviceAssignments"), {
      counterId: selectedCounterId,
      serviceId: selectedServiceId,
      status: "active",
      createdAt: serverTimestamp(),
    });

    setSelectedCounterId("");
    setSelectedServiceId("");
    setMessage("Service assigned to counter.");
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Assign Services to Counters</h1>
      <p>Select a service and map it to the appropriate counter journey.</p>

      {message && <p style={{ color: "green" }}>{message}</p>}

      <form onSubmit={saveAssignment} style={formStyle}>
        <label>
          Select Service
          <select
            required
            value={selectedServiceId}
            onChange={(event) => setSelectedServiceId(event.target.value)}
          >
            <option value="">Choose a service</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Select Counter
          <select
            required
            value={selectedCounterId}
            onChange={(event) => setSelectedCounterId(event.target.value)}
          >
            <option value="">Choose a counter</option>
            {counters.map((counter) => (
              <option key={counter.id} value={counter.id}>
                {counter.name} ({counter.counterNumber})
              </option>
            ))}
          </select>
        </label>

        <button type="submit" style={button}>
          Save Assignment
        </button>
      </form>

      <section style={{ marginTop: 32 }}>
        <h2>Active Assignments</h2>
        {assignments.length === 0 ? (
          <p>No assignments configured yet.</p>
        ) : (
          <ul>
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                Service {assignment.serviceId} → Counter {assignment.counterId}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const formStyle = {
  display: "grid",
  gap: 16,
};

const button = {
  background: "#0066ff",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
};
