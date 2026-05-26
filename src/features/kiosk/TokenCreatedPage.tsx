import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { db } from "../../firebase/firebase";

type Token = {
  tokenNumber: string;
  status: string;
};

export default function TokenCreatedPage() {
  const { organizationId, tokenId } = useParams();

  const [token, setToken] = useState<Token | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    if (!organizationId || !tokenId) return;

    const tokenRef = doc(
      db,
      "organizations",
      organizationId,
      "tokens",
      tokenId,
    );

    const unsubscribe = onSnapshot(tokenRef, (snapshot) => {
      if (snapshot.exists()) {
        setToken(snapshot.data() as Token);
      }
    });

    const trackingUrl = `${window.location.origin}/track/${organizationId}/${tokenId}`;

    QRCode.toDataURL(trackingUrl).then(setQrCodeUrl);

    return unsubscribe;
  }, [organizationId, tokenId]);

  return (
    <main className="page page-center">
      <section className="page-hero">
        <div className="page-eyebrow">Queue token</div>
        <h1 className="page-title">Your Token</h1>
        <p className="page-subtitle">
          Scan the QR code to track your queue and stay informed in real time.
        </p>
      </section>

      <section
        className="page-card"
        style={{ width: "100%", maxWidth: 480, textAlign: "center" }}
      >
        <h2>{token?.tokenNumber}</h2>
        {qrCodeUrl && (
          <img
            src={qrCodeUrl}
            alt="Queue tracking QR code"
            style={{ maxWidth: "100%", borderRadius: 20, margin: "24px 0" }}
          />
        )}
        <div className="kicker">Status: {token?.status}</div>
      </section>
    </main>
  );
}
