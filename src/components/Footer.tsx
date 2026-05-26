import React from "react";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="page">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Waitless</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>
              Simple queue management for modern businesses
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="/request-demo" className="secondary-btn">
              Request demo
            </a>
            <a href="/internal-login" className="secondary-btn">
              Login
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
