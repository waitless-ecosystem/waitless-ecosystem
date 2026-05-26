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
      <main className="page page-center">
        <div className="error-banner">{error}</div>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Staff counter</div>
        <h1 className="page-title">
          {counter?.name} ({counter?.counterNumber})
        </h1>
        <p className="page-subtitle">
          Manage the queue for your assigned counter.
        </p>
      </section>

      <div className="action-group" style={{ marginBottom: 24 }}>
        <button type="button" className="nav-button" onClick={logout}>
          Logout
        </button>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      <section className="page-card">
        <h2>Now Serving</h2>
        {currentStep ? (
          <div className="step-card">
            <p>
              <strong>Token:</strong> {currentStep.tokenNumber}
            </p>
            <p>
              <strong>Service:</strong> {currentStep.serviceName}
            </p>
            <p>
              <strong>Status:</strong> {currentStep.status}
            </p>
            <button className="primary-btn" onClick={completeCurrent}>
              Complete Service
            </button>
          </div>
        ) : (
          <p>No current customer.</p>
        )}

        <button
          className="primary-btn"
          style={{ marginTop: 18 }}
          onClick={callNext}
        >
          Call Next Customer
        </button>
      </section>

      <section className="page-card" style={{ marginTop: 24 }}>
        <h2>Waiting Queue</h2>

        {steps.filter((step) => step.status === "waiting").length === 0 ? (
          <p>No customers waiting.</p>
        ) : (
          <div className="content-grid-1">
            {steps
              .filter((step) => step.status === "waiting")
              .map((step) => (
                <div key={step.id} className="step-row">
                  <div>
                    <strong>{step.tokenNumber}</strong>
                    <p className="kicker">{step.serviceName}</p>
                  </div>
                  <div>{step.status}</div>
                </div>
              ))}
          </div>
        )}
      </section>
    </main>
  );
}
