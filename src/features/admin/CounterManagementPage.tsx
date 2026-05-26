import { FormEvent, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where,
} from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../../firebase/firebase";

type Counter = {
  id: string;
  name: string;
  counterNumber: string;
  status: string;
};

export default function CounterManagementPage() {
  const { userProfile } = useAuth();
  const organizationId = userProfile?.organizationId;

  const [counters, setCounters] = useState<Counter[]>([]);
  const [name, setName] = useState("");
  const [counterNumber, setCounterNumber] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId) return;

    const counterQuery = query(
      collection(db, "organizations", organizationId, "counters"),
      where("status", "==", "active"),
    );

    return onSnapshot(counterQuery, (snapshot) => {
      setCounters(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Counter[],
      );
    });
  }, [organizationId]);

  async function addCounter(event: FormEvent) {
    event.preventDefault();
    if (!organizationId) return;

    await addDoc(collection(db, "organizations", organizationId, "counters"), {
      name,
      counterNumber,
      status: "active",
      currentTokenId: null,
      currentStepId: null,
      previousTokenId: null,
      createdAt: serverTimestamp(),
    });

    setName("");
    setCounterNumber("");
    setMessage("Counter added.");
  }

  async function deactivateCounter(counterId: string) {
    if (!organizationId) return;
    await updateDoc(
      doc(db, "organizations", organizationId, "counters", counterId),
      { status: "inactive" },
    );
    setMessage("Counter deactivated.");
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Manage Counters</h1>
      <p>Create counters and assign them to services from the admin console.</p>

      {message && <p style={{ color: "green" }}>{message}</p>}

      <form onSubmit={addCounter} style={formStyle}>
        <label>
          Counter Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label>
          Counter Number
          <input
            required
            value={counterNumber}
            onChange={(event) => setCounterNumber(event.target.value)}
            placeholder="e.g. C1"
          />
        </label>

        <button type="submit" style={button}>
          Add Counter
        </button>
      </form>

      <section style={{ marginTop: 32 }}>
        <h2>Active Counters</h2>
        {counters.length === 0 ? (
          <p>No counters configured yet.</p>
        ) : (
          <ul>
            {counters.map((counter) => (
              <li key={counter.id} style={{ marginBottom: 8 }}>
                <strong>{counter.name}</strong> ({counter.counterNumber})
                <button
                  type="button"
                  onClick={() => deactivateCounter(counter.id)}
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
