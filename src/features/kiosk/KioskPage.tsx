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
      const createCustomerToken = httpsCallable(
        functions,
        "createCustomerToken",
      );
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
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Customer kiosk</div>
        <h1 className="page-title">Select your services</h1>
        <p className="page-subtitle">
          Choose the services you need and get a queue token instantly.
        </p>
      </section>

      {services.length === 0 ? (
        <section className="page-card">
          <p>No services are currently configured for this kiosk.</p>
        </section>
      ) : (
        <section className="page-card">
          <div className="content-grid-2">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                className={
                  selectedServices.includes(service.id)
                    ? "secondary-btn"
                    : "section-card"
                }
                onClick={() => toggleService(service.id)}
                style={{ textAlign: "left" }}
              >
                <strong>{service.name}</strong>
                <p className="kicker">
                  {service.prefix} • {service.averageServiceTime} min average
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="page-card" style={{ textAlign: "center" }}>
        <button
          className="primary-btn"
          type="button"
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Submitting..." : "Create Token"}
        </button>
        {error && (
          <div className="error-banner" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
