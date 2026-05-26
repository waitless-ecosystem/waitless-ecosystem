import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
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

    const tokenRef = doc(db, "organizations", organizationId, "tokens", tokenId);
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
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Queue Tracking</h1>
      <p>Real-time status for your token.</p>

      {token ? (
        <>
          <div style={statusCard}>
            <h2>Token</h2>
            <p style={{ fontSize: 32 }}>{token.tokenNumber}</p>
            <p>Status: {token.status}</p>
          </div>

          <div style={{ marginTop: 24 }}>
            <h2>Service Journey</h2>
            {steps.map((step) => (
              <div key={step.id} style={stepRow}>
                <div>
                  <strong>{step.serviceName}</strong>
                  <div style={{ color: "#555" }}>Step {step.sequenceNumber}</div>
                </div>
                <div>{step.status}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p>Loading token status…</p>
      )}
    </div>
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
