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
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Demo requests</div>
        <h1 className="page-title">Request a Demo</h1>
        <p className="page-subtitle">
          Share your organization details below. Once approved, your
          administrator will receive access to configure services, counters, and
          kiosk flow.
        </p>
      </section>

      <section className="page-card">
        <form className="form-grid" onSubmit={handleSubmit}>
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

          <button className="primary-btn" type="submit">
            Send Request
          </button>
        </form>

        {feedback && <div className="success-banner">{feedback}</div>}
        {error && <div className="error-banner">{error}</div>}
      </section>
    </main>
  );
}
