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
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

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

      setMessage(
        `Approved ${requestId}. Admin: ${result.data.adminEmail}.`,
      );
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
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Superadmin Console</h1>
      <p>Review new demo requests and create approved organizations.</p>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 24 }}>
        <thead>
          <tr>
            <th style={th}>Organization</th>
            <th style={th}>Contact</th>
            <th style={th}>Email</th>
            <th style={th}>Industry</th>
            <th style={th}>Message</th>
            <th style={th}>Status</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td style={td}>{request.organizationName}</td>
              <td style={td}>{request.contactName}</td>
              <td style={td}>{request.email}</td>
              <td style={td}>{request.industry || "N/A"}</td>
              <td style={td}>{request.message || "-"}</td>
              <td style={td}>{request.status}</td>
              <td style={td}>
                {request.status === "pending" ? (
                  selectedApprovalId === request.id ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        type="password"
                        value={temporaryPassword}
                        onChange={(event) => setTemporaryPassword(event.target.value)}
                        placeholder="Temp password"
                        style={{ padding: 8, width: "100%" }}
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => confirmApproval(request.id)}
                          disabled={processingRequestId === request.id}
                        >
                          {processingRequestId === request.id
                            ? "Approving..."
                            : "Confirm Approval"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelApproval}
                          disabled={processingRequestId === request.id}
                          style={{ marginLeft: 8 }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => beginApproval(request.id)}
                        disabled={processingRequestId === request.id}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectRequest(request.id)}
                        disabled={processingRequestId === request.id}
                        style={{ marginLeft: 8 }}
                      >
                        {processingRequestId === request.id
                          ? "Rejecting..."
                          : "Reject"}
                      </button>
                    </>
                  )
                ) : (
                  <span>{request.status}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
