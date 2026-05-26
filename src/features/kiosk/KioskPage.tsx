import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase/firebase";

type Service = {
  id: string;
  name: string;
  prefix: string;
  averageServiceTime: number;
};

export default function KioskPage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!organizationId) return;

    const servicesQuery = query(
      collection(db, "organizations", organizationId, "services"),
      where("status", "==", "active"),
    );

    return onSnapshot(servicesQuery, (snapshot) => {
      setServices(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Service[],
      );
    });
  }, [organizationId]);

  function toggleService(serviceId: string) {
    setSelectedServices((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  }

  async function submit() {
    if (!organizationId) return;
    setError("");

    if (selectedServices.length === 0) {
      setError("Select at least one service before submitting.");
      return;
    }

    setBusy(true);

    try {
      const createCustomerToken = httpsCallable(functions, "createCustomerToken");
      const result: any = await createCustomerToken({
        organizationId,
        selectedServiceIds: selectedServices,
      });
      navigate(`/token-created/${organizationId}/${result.data.tokenId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not create token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Customer Kiosk</h1>
      <p>Select the services you require and receive a queue token instantly.</p>

      {services.length === 0 ? (
        <p>No services are currently configured for this kiosk.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {services.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => toggleService(service.id)}
              style={{
                padding: 18,
                border: selectedServices.includes(service.id)
                  ? "2px solid #0066ff"
                  : "1px solid #ccc",
                background: selectedServices.includes(service.id)
                  ? "#eef4ff"
                  : "white",
                textAlign: "left",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              <strong>{service.name}</strong>
              <div style={{ fontSize: 14, color: "#555" }}>
                {service.prefix} • {service.averageServiceTime} min average
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{ marginTop: 24, padding: "12px 20px", borderRadius: 8 }}
      >
        {busy ? "Submitting..." : "Create Token"}
      </button>

      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}
    </div>
  );
}
