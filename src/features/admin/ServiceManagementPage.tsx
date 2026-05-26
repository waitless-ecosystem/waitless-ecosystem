import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, onSnapshot, query, serverTimestamp, updateDoc, doc, where } from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../../firebase/firebase";

type Service = {
  id: string;
  name: string;
  prefix: string;
  averageServiceTime: number;
  status: string;
};

export default function ServiceManagementPage() {
  const { userProfile } = useAuth();
  const organizationId = userProfile?.organizationId;

  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [averageServiceTime, setAverageServiceTime] = useState(5);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    const serviceQuery = query(
      collection(db, "organizations", organizationId, "services"),
      where("status", "==", "active"),
    );

    return onSnapshot(serviceQuery, (snapshot) => {
      setServices(
        snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Service[],
      );
    });
  }, [organizationId]);

  async function addService(event: FormEvent) {
    event.preventDefault();
    if (!organizationId) return;

    await addDoc(collection(db, "organizations", organizationId, "services"), {
      name,
      prefix,
      averageServiceTime,
      status: "active",
      createdAt: serverTimestamp(),
    });

    setName("");
    setPrefix("");
    setAverageServiceTime(5);
    setMessage("Service added.");
  }

  async function deactivateService(serviceId: string) {
    if (!organizationId) return;
    await updateDoc(
      doc(db, "organizations", organizationId, "services", serviceId),
      { status: "inactive" },
    );
    setMessage("Service deactivated.");
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Manage Services</h1>
      <p>Add and maintain service definitions for your organization.</p>

      {message && <p style={{ color: "green" }}>{message}</p>}

      <form onSubmit={addService} style={formStyle}>
        <label>
          Service Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label>
          Prefix
          <input
            required
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            placeholder="e.g. CUST"
          />
        </label>

        <label>
          Average Time (minutes)
          <input
            required
            type="number"
            min={1}
            value={averageServiceTime}
            onChange={(event) => setAverageServiceTime(Number(event.target.value))}
          />
        </label>

        <button type="submit" style={button}>
          Add Service
        </button>
      </form>

      <section style={{ marginTop: 32 }}>
        <h2>Active Services</h2>
        {services.length === 0 ? (
          <p>No services configured yet.</p>
        ) : (
          <ul>
            {services.map((service) => (
              <li key={service.id} style={{ marginBottom: 8 }}>
                <strong>{service.name}</strong> ({service.prefix}) — {service.averageServiceTime} min
                <button
                  type="button"
                  onClick={() => deactivateService(service.id)}
                  style={{ marginLeft: 12 }}
                >
                  Deactivate
                </button>
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
  maxWidth: 520,
};

const button = {
  background: "#0066ff",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
};
