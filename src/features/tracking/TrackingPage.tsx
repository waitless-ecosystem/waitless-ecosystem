import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/firebase";

type Token = {
  tokenNumber: string;
  status: string;
  currentStepId?: string | null;
};

type Step = {
  id: string;
  serviceName: string;
  tokenNumber: string;
  status: string;
  sequenceNumber: number;
};

export default function TrackingPage() {
  const { organizationId, tokenId } = useParams();
  const [token, setToken] = useState<Token | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    if (!organizationId || !tokenId) return;

    const tokenRef = doc(
      db,
      "organizations",
      organizationId,
      "tokens",
      tokenId,
    );
    const unsubscribeToken = onSnapshot(tokenRef, (snapshot) => {
      setToken(snapshot.exists() ? (snapshot.data() as Token) : null);
    });

    const stepsQuery = query(
      collection(db, "organizations", organizationId, "queueSteps"),
      where("tokenId", "==", tokenId),
      orderBy("sequenceNumber", "asc"),
    );
    const unsubscribeSteps = onSnapshot(stepsQuery, (snapshot) => {
      setSteps(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Step[],
      );
    });

    return () => {
      unsubscribeToken();
      unsubscribeSteps();
    };
  }, [organizationId, tokenId]);

  return (
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Queue tracking</div>
        <h1 className="page-title">Real-time token status</h1>
        <p className="page-subtitle">
          Follow each step of your queue journey and see the latest status.
        </p>
      </section>

      {token ? (
        <>
          <section className="page-card">
            <h2>Token</h2>
            <p style={{ fontSize: 34, margin: "16px 0" }}>
              {token.tokenNumber}
            </p>
            <div className="kicker">Status: {token.status}</div>
          </section>

          <section className="page-card" style={{ marginTop: 24 }}>
            <h2>Service Journey</h2>
            {steps.map((step) => (
              <div key={step.id} className="step-row">
                <div>
                  <strong>{step.serviceName}</strong>
                  <p className="kicker">Step {step.sequenceNumber}</p>
                </div>
                <div>{step.status}</div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="page-card">
          <p>Loading token status…</p>
        </section>
      )}
    </main>
  );
}

const statusCard = {
  border: "1px solid #ddd",
  padding: 24,
  borderRadius: 10,
};

const stepRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "12px 0",
  borderBottom: "1px solid #eee",
};
