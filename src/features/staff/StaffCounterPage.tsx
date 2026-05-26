import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useParams } from "react-router-dom";
import { db, functions } from "../../firebase/firebase";
import { useAuth } from "../auth/AuthProvider";

type Counter = {
  name: string;
  counterNumber: string;
  currentTokenId: string | null;
  currentStepId: string | null;
};

type Step = {
  id: string;
  tokenId: string;
  tokenNumber: string;
  serviceName: string;
  status: string;
  sequenceNumber: number;
};

export default function StaffCounterPage() {
  const { organizationId, counterId } = useParams();
  const { logout } = useAuth();

  const [counter, setCounter] = useState<Counter | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId || !counterId) {
      setError("Organization ID or Counter ID is missing.");
      setLoading(false);
      return;
    }

    const counterRef = doc(
      db,
      "organizations",
      organizationId,
      "counters",
      counterId,
    );

    const unsubscribeCounter = onSnapshot(counterRef, (snapshot) => {
      if (snapshot.exists()) {
        setCounter(snapshot.data() as Counter);
        setLoading(false);
      } else {
        setError("Counter not found.");
        setLoading(false);
      }
    });

    const stepsQuery = query(
      collection(db, "organizations", organizationId, "queueSteps"),
      where("counterId", "==", counterId),
      where("status", "in", ["waiting", "called", "serving"]),
      orderBy("createdAt", "asc"),
    );

    const unsubscribeSteps = onSnapshot(
      stepsQuery,
      (snapshot) => {
        setSteps(
          snapshot.docs.map((document) => ({
            id: document.id,
            ...document.data(),
          })) as Step[],
        );
      },
      (err) => {
        console.error("Error loading steps:", err);
        setError("Failed to load queue steps.");
      },
    );

    return () => {
      unsubscribeCounter();
      unsubscribeSteps();
    };
  }, [organizationId, counterId]);

  async function callNext() {
    try {
      setMessage("");
      setError("");
      const callNextCustomer = httpsCallable(functions, "callNextCustomer");

      await callNextCustomer({
        organizationId,
        counterId,
      });

      setMessage("Next customer called.");
    } catch (err: any) {
      console.error("Error calling next customer:", err);
      setError(err.message || "Failed to call next customer.");
    }
  }

  async function completeCurrent() {
    try {
      setMessage("");
      setError("");

      if (!counter?.currentStepId) {
        setError("No current service to complete.");
        return;
      }

      const completeCurrentService = httpsCallable(
        functions,
        "completeCurrentService",
      );

      await completeCurrentService({
        organizationId,
        counterId,
        stepId: counter.currentStepId,
      });

      setMessage("Current service completed.");
    } catch (err: any) {
      console.error("Error completing service:", err);
      setError(err.message || "Failed to complete service.");
    }
  }

  const currentStep = steps.find((step) => step.id === counter?.currentStepId);

  if (loading) {
    return <p style={{ padding: 24 }}>Loading staff counter...</p>;
  }

  if (error && !counter) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "red" }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1>
          Staff Counter: {counter?.name} ({counter?.counterNumber})
        </h1>
        <button onClick={logout} style={{ padding: "8px 16px" }}>
          Logout
        </button>
      </div>

      {message && <p style={{ color: "green", marginBottom: 16 }}>{message}</p>}
      {error && <p style={{ color: "red", marginBottom: 16 }}>{error}</p>}

      <section style={card}>
        <h2>Now Serving</h2>

        {currentStep ? (
          <>
            <p>
              <strong>Token:</strong> {currentStep.tokenNumber}
            </p>
            <p>
              <strong>Service:</strong> {currentStep.serviceName}
            </p>
            <p>
              <strong>Status:</strong> {currentStep.status}
            </p>
            <button onClick={completeCurrent} style={button}>
              Complete Service
            </button>
          </>
        ) : (
          <p>No current customer.</p>
        )}

        <button onClick={callNext} style={{ ...button, marginTop: 16 }}>
          Call Next Customer
        </button>
      </section>

      <section style={card}>
        <h2>Waiting Queue</h2>

        {steps.filter((step) => step.status === "waiting").length === 0 ? (
          <p>No customers waiting.</p>
        ) : (
          <div>
            {steps
              .filter((step) => step.status === "waiting")
              .map((step) => (
                <div
                  key={step.id}
                  style={{ padding: "8px 0", borderBottom: "1px solid #ddd" }}
                >
                  <strong>{step.tokenNumber}</strong> - {step.serviceName}
                </div>
              ))}
          </div>
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

const button = {
  background: "#0066ff",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
};
