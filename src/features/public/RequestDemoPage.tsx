import { FormEvent, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/firebase";

export default function RequestDemoPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback("");
    setError("");

    try {
      await addDoc(collection(db, "demoRequests"), {
        organizationName,
        contactName,
        email,
        industry,
        message,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setFeedback(
        "Thank you! Your demo request has been submitted and will be reviewed by our superadmin team.",
      );
      setOrganizationName("");
      setContactName("");
      setEmail("");
      setIndustry("");
      setMessage("");
    } catch (err) {
      console.error(err);
      setError("Could not submit request. Please try again.");
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: "60px auto", padding: 24 }}>
      <h1>Request a Demo</h1>
      <p>
        Share your organization details below. Once approved, your administrator
        will receive access to configure services, counters, and kiosk flow.
      </p>

      <form onSubmit={handleSubmit} style={formStyle}>
        <label>
          Organization Name
          <input
            required
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
        </label>

        <label>
          Contact Name
          <input
            required
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
          />
        </label>

        <label>
          Contact Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          Industry
          <input
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="Banking, Healthcare, Retail, etc."
          />
        </label>

        <label>
          What would you like to achieve with Waitless?
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <button type="submit" style={submitButton}>
          Send Request
        </button>
      </form>

      {feedback && <p style={{ color: "green" }}>{feedback}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

const formStyle = {
  display: "grid",
  gap: 16,
};

const submitButton = {
  background: "#0066ff",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: 8,
  cursor: "pointer",
};
