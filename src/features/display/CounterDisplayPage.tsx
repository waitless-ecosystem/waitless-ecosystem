import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useParams } from "react-router-dom";
import { db } from "../../firebase/firebase";

type Counter = {
  name: string;
  counterNumber: string;
  currentTokenId: string | null;
  previousTokenId: string | null;
};

type Step = {
  id: string;
  tokenNumber: string;
  serviceName: string;
  status: string;
};

export default function CounterDisplayPage() {
  const { organizationId, counterId } = useParams();

  const [counter, setCounter] = useState<Counter | null>(null);
  const [upcoming, setUpcoming] = useState<Step[]>([]);

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

    const upcomingQuery = query(
      collection(db, "organizations", organizationId, "queueSteps"),
      where("counterId", "==", counterId),
      where("status", "==", "waiting"),
      orderBy("createdAt", "asc"),
      limit(5),
    );

    const unsubscribeUpcoming = onSnapshot(upcomingQuery, (snapshot) => {
      setUpcoming(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Step[],
      );
    });

    return () => {
      unsubscribeCounter();
      unsubscribeUpcoming();
    };
  }, [organizationId, counterId]);

  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h1>
        {counter?.name} ({counter?.counterNumber})
      </h1>

      <section style={{ marginTop: 40 }}>
        <h2>Previous</h2>
        <p style={{ fontSize: 36 }}>{counter?.previousTokenId || "-"}</p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Now Serving</h2>
        <p style={{ fontSize: 64 }}>{counter?.currentTokenId || "-"}</p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Next</h2>

        {upcoming.map((step) => (
          <p key={step.id} style={{ fontSize: 32 }}>
            {step.tokenNumber}
          </p>
        ))}
      </section>
    </div>
  );
}
