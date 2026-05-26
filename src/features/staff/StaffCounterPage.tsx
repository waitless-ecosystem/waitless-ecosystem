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

  const [counter, setCounter] = useState<Counter | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!organizationId || !counterId) return;

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
      }
    });

    const stepsQuery = query(
      collection(db, "organizations", organizationId, "queueSteps"),
      where("counterId", "==", counterId),
      where("status", "in", ["waiting", "called", "serving"]),
      orderBy("createdAt", "asc"),
    );

    const unsubscribeSteps = onSnapshot(stepsQuery, (snapshot) => {
      setSteps(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Step[],
      );
    });

    return () => {
      unsubscribeCounter();
      unsubscribeSteps();
    };
  }, [organizationId, counterId]);

  async function callNext() {
    const callNextCustomer = httpsCallable(functions, "callNextCustomer");

    await callNextCustomer({
      organizationId,
      counterId,
    });

    setMessage("Next customer called.");
  }

  async function completeCurrent() {
    if (!counter?.currentStepId) return;

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
  }

  const currentStep = steps.find((step) => step.id === counter?.currentStepId);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>
        Staff Counter: {counter?.name} ({counter?.counterNumber})
      </h1>

      {message && <p style={{ color: "green" }}>{message}</p>}

      <section style={card}>
        <h2>Now Serving</h2>

        {currentStep ? (
          <>
            <p>Token: {currentStep.tokenNumber}</p>
            <p>Service: {currentStep.serviceName}</p>
            <p>Status: {currentStep.status}</p>
            <button onClick={completeCurrent}>Complete Service</button>
          </>
        ) : (
          <p>No current customer.</p>
        )}

        <button onClick={callNext} style={{ marginTop: 16 }}>
          Call Next Customer
        </button>
      </section>

      <section style={card}>
        <h2>Waiting Queue</h2>

        {steps
          .filter((step) => step.status === "waiting")
          .map((step) => (
            <div key={step.id}>
              {step.tokenNumber} - {step.serviceName}
            </div>
          ))}
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
