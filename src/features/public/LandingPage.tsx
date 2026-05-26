import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <header style={{ marginBottom: 40 }}>
        <h1>Waitless Queue Management</h1>
        <p>
          A customizable queue ecosystem for any organization: self-service kiosk
          check-in, real-time tracking, and staff counter operations.
        </p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2>Platform highlights</h2>
        <ul>
          <li>Superadmin control for demo approvals and client onboarding.</li>
          <li>Organization admin tools for services, counters, and routing.</li>
          <li>Customer-facing kiosk with token generation and QR tracking.</li>
          <li>Staff dashboards, live queue management, and counter displays.</li>
          <li>Flexible configuration for banks, healthcare, retail, and service centers.</li>
        </ul>
      </section>

      <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link to="/request-demo">
          <button style={primaryButton}>Request a Demo</button>
        </Link>
        <Link to="/internal-login">
          <button style={secondaryButton}>Internal Login</button>
        </Link>
      </section>
    </div>
  );
}

const primaryButton = {
  background: "#0066ff",
  color: "white",
  border: "none",
  padding: "14px 24px",
  borderRadius: 8,
  cursor: "pointer",
};

const secondaryButton = {
  ...primaryButton,
  background: "#f3f4f6",
  color: "#111",
};
