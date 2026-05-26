import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase/firebase";

type DemoRequest = {
  id: string;
  organizationName: string;
  contactName: string;
  email: string;
  industry: string;
  message: string;
  status: "pending" | "approved" | "rejected" | "converted";
};

export default function SuperAdminPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(
    null,
  );
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const demoRequestQuery = query(
      collection(db, "demoRequests"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(demoRequestQuery, (snapshot) => {
      setRequests(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as DemoRequest[],
      );
    });

    return unsubscribe;
  }, []);

  function beginApproval(requestId: string) {
    setMessage("");
    setError("");
    setTemporaryPassword("");
    setSelectedApprovalId(requestId);
  }

  function cancelApproval() {
    setSelectedApprovalId(null);
    setTemporaryPassword("");
  }

  async function confirmApproval(requestId: string) {
    setMessage("");
    setError("");

    if (!temporaryPassword) {
      setError("Temporary password is required to approve this request.");
      return;
    }

    setProcessingRequestId(requestId);

    try {
      const approveDemoRequest = httpsCallable(functions, "approveDemoRequest");
      const result: any = await approveDemoRequest({
        requestId,
        temporaryPassword,
      });

      setMessage(`Approved ${requestId}. Admin: ${result.data.adminEmail}.`);
      cancelApproval();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not approve the request.");
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function rejectRequest(requestId: string) {
    setMessage("");
    setError("");
    setProcessingRequestId(requestId);

    try {
      const rejectDemoRequest = httpsCallable(functions, "rejectDemoRequest");
      await rejectDemoRequest({ requestId });
      setMessage("Request rejected successfully.");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not reject the request.");
    } finally {
      setProcessingRequestId(null);
    }
  }

  return (
    <main className="page">
      <section className="page-hero">
        <div className="page-eyebrow">Superadmin</div>
        <h1 className="page-title">Demo request review</h1>
        <p className="page-subtitle">
          Review demo requests and approve new organizations from the central
          console.
        </p>
      </section>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      <section className="table-card" style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Industry</th>
              <th>Message</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.organizationName}</td>
                <td>{request.contactName}</td>
                <td>{request.email}</td>
                <td>{request.industry || "N/A"}</td>
                <td>{request.message || "-"}</td>
                <td>{request.status}</td>
                <td>
                  {request.status === "pending" ? (
                    selectedApprovalId === request.id ? (
                      <div className="form-grid">
                        <input
                          type="password"
                          value={temporaryPassword}
                          onChange={(event) =>
                            setTemporaryPassword(event.target.value)
                          }
                          placeholder="Temp password"
                        />
                        <div className="action-group">
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={() => confirmApproval(request.id)}
                            disabled={processingRequestId === request.id}
                          >
                            {processingRequestId === request.id
                              ? "Approving..."
                              : "Confirm Approval"}
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={cancelApproval}
                            disabled={processingRequestId === request.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="action-group">
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => beginApproval(request.id)}
                          disabled={processingRequestId === request.id}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => rejectRequest(request.id)}
                          disabled={processingRequestId === request.id}
                        >
                          {processingRequestId === request.id
                            ? "Rejecting..."
                            : "Reject"}
                        </button>
                      </div>
                    )
                  ) : (
                    <span>{request.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const th = {
  textAlign: "left" as const,
  borderBottom: "1px solid #ddd",
  padding: 12,
};

const td = {
  borderBottom: "1px solid #eee",
  padding: 12,
};
