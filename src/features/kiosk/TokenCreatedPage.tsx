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
    <div style={{ padding: 24, textAlign: "center" }}>
      <h1>Your Token</h1>

      <h2>{token?.tokenNumber}</h2>

      <p>Scan this QR code to track your queue in real time.</p>

      {qrCodeUrl && <img src={qrCodeUrl} alt="Queue tracking QR code" />}

      <p>Status: {token?.status}</p>
    </div>
  );
}
