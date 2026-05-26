import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

admin.initializeApp();

const db = admin.firestore();

async function requireSuperadmin(uid: string) {
  const userSnap = await db.collection("users").doc(uid).get();

  if (!userSnap.exists) {
    throw new HttpsError("permission-denied", "User profile not found.");
  }

  const user = userSnap.data();

  if (user?.platformRole !== "superadmin" || user?.status !== "active") {
    throw new HttpsError("permission-denied", "Superadmin access required.");
  }
}

export const approveDemoRequest = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required.");
    }

    await requireSuperadmin(request.auth.uid);

    const { requestId, temporaryPassword } = request.data;

    if (!requestId || !temporaryPassword) {
      throw new HttpsError(
        "invalid-argument",
        "Request ID and temporary password are required.",
      );
    }

    const requestRef = db.collection("demoRequests").doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      throw new HttpsError("not-found", "Demo request not found.");
    }

    const demoRequest = requestSnap.data();

    if (!demoRequest) {
      throw new HttpsError("not-found", "Demo request data not found.");
    }

    if (!demoRequest.email) {
      throw new HttpsError(
        "invalid-argument",
        "Demo request email is missing.",
      );
    }

    if (!demoRequest.organizationName) {
      throw new HttpsError(
        "invalid-argument",
        "Demo request organization name is missing.",
      );
    }

    let adminUser;

    try {
      adminUser = await admin.auth().createUser({
        email: demoRequest.email,
        password: temporaryPassword,
        displayName:
          demoRequest.contactName ||
          demoRequest.organizationName ||
          "Organization Admin",
      });
    } catch (error: any) {
      if (error.code === "auth/email-already-exists") {
        adminUser = await admin.auth().getUserByEmail(demoRequest.email);
      } else {
        console.error("Error creating organization admin user:", error);

        throw new HttpsError(
          "internal",
          error.message || "Could not create organization administrator.",
        );
      }
    }

    const organizationRef = db.collection("organizations").doc();

    await organizationRef.set({
      name: demoRequest.organizationName,
      industry: demoRequest.industry || "General",
      status: "active",
      plan: "demo",
      createdFromDemoRequestId: requestId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
    });

    await db
      .collection("users")
      .doc(adminUser.uid)
      .set(
        {
          uid: adminUser.uid,
          email: demoRequest.email,
          displayName:
            demoRequest.contactName ||
            demoRequest.organizationName ||
            "Organization Admin",
          platformRole: "organization_admin",
          status: "active",
          organizationId: organizationRef.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    await requestRef.update({
      status: "converted",
      organizationId: organizationRef.id,
      approvedBy: request.auth.uid,
      approvedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      organizationId: organizationRef.id,
      adminUid: adminUser.uid,
      adminEmail: demoRequest.email,
    };
  } catch (error: any) {
    console.error("approveDemoRequest failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Approval failed because of an internal server error.",
    );
  }
});

export const rejectDemoRequest = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required.");
    }

    await requireSuperadmin(request.auth.uid);

    const { requestId } = request.data;

    if (!requestId) {
      throw new HttpsError("invalid-argument", "Request ID is required.");
    }

    await db.collection("demoRequests").doc(requestId).update({
      status: "rejected",
      rejectedBy: request.auth.uid,
      rejectedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
    };
  } catch (error: any) {
    console.error("rejectDemoRequest failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Rejection failed because of an internal server error.",
    );
  }
});

export const createCustomerToken = onCall(async (request) => {
  try {
    const { organizationId, selectedServiceIds } = request.data;

    if (!organizationId || !Array.isArray(selectedServiceIds)) {
      throw new HttpsError("invalid-argument", "Invalid token request.");
    }

    if (selectedServiceIds.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "At least one service is required.",
      );
    }

    const organizationRef = db.collection("organizations").doc(organizationId);
    const organizationSnap = await organizationRef.get();

    if (!organizationSnap.exists) {
      throw new HttpsError("not-found", "Organization not found.");
    }

    const tokenRef = organizationRef.collection("tokens").doc();
    const tokenSequenceRef = organizationRef
      .collection("system")
      .doc("tokenSequence");

    const tokenNumber = await db.runTransaction(async (transaction) => {
      const sequenceSnap = await transaction.get(tokenSequenceRef);
      const current = sequenceSnap.exists ? sequenceSnap.data()?.value || 0 : 0;

      const next = current + 1;

      transaction.set(
        tokenSequenceRef,
        {
          value: next,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      return `A${String(next).padStart(3, "0")}`;
    });

    const steps: FirebaseFirestore.DocumentReference[] = [];
    const stepDataList: any[] = [];

    for (let index = 0; index < selectedServiceIds.length; index++) {
      const serviceId = selectedServiceIds[index];

      const serviceSnap = await organizationRef
        .collection("services")
        .doc(serviceId)
        .get();

      if (!serviceSnap.exists) {
        throw new HttpsError("not-found", `Service ${serviceId} not found.`);
      }

      const service = serviceSnap.data();

      const assignmentsSnap = await organizationRef
        .collection("serviceAssignments")
        .where("serviceId", "==", serviceId)
        .where("status", "==", "active")
        .get();

      if (assignmentsSnap.empty) {
        throw new HttpsError(
          "failed-precondition",
          `No counter assigned for service ${service?.name}.`,
        );
      }

      let bestCounterId = "";
      let bestCounterName = "";
      let bestScore = Number.MAX_SAFE_INTEGER;

      for (const assignmentDoc of assignmentsSnap.docs) {
        const assignment = assignmentDoc.data();
        const counterId = assignment.counterId;

        const counterSnap = await organizationRef
          .collection("counters")
          .doc(counterId)
          .get();

        if (!counterSnap.exists) {
          continue;
        }

        const counter = counterSnap.data();

        if (counter?.status !== "active") {
          continue;
        }

        const waitingSnap = await organizationRef
          .collection("queueSteps")
          .where("counterId", "==", counterId)
          .where("status", "in", ["waiting", "called", "serving"])
          .get();

        const score =
          waitingSnap.size * Number(service?.averageServiceTime || 5);

        if (score < bestScore) {
          bestScore = score;
          bestCounterId = counterId;
          bestCounterName =
            counter?.name || counter?.counterNumber || counterId;
        }
      }

      if (!bestCounterId) {
        throw new HttpsError(
          "failed-precondition",
          `No active counter available for service ${service?.name}.`,
        );
      }

      const stepRef = organizationRef.collection("queueSteps").doc();

      steps.push(stepRef);

      stepDataList.push({
        id: stepRef.id,
        tokenId: tokenRef.id,
        tokenNumber,
        sequenceNumber: index + 1,
        serviceId,
        serviceName: service?.name || "Service",
        counterId: bestCounterId,
        counterName: bestCounterName,
        status: index === 0 ? "waiting" : "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const batch = db.batch();

    batch.set(tokenRef, {
      tokenNumber,
      status: "waiting",
      selectedServiceIds,
      currentStepId: stepDataList[0].id,
      createdAt: FieldValue.serverTimestamp(),
    });

    for (let i = 0; i < steps.length; i++) {
      batch.set(steps[i], stepDataList[i]);
    }

    await batch.commit();

    return {
      tokenId: tokenRef.id,
      tokenNumber,
    };
  } catch (error: any) {
    console.error("createCustomerToken failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError("internal", error.message || "Token creation failed.");
  }
});

export const callNextCustomer = onCall(async (request) => {
  try {
    const { organizationId, counterId } = request.data;

    if (!organizationId || !counterId) {
      throw new HttpsError(
        "invalid-argument",
        "Organization and counter are required.",
      );
    }

    const organizationRef = db.collection("organizations").doc(organizationId);
    const counterRef = organizationRef.collection("counters").doc(counterId);

    const waitingSnap = await organizationRef
      .collection("queueSteps")
      .where("counterId", "==", counterId)
      .where("status", "==", "waiting")
      .orderBy("createdAt", "asc")
      .limit(1)
      .get();

    if (waitingSnap.empty) {
      throw new HttpsError("not-found", "No waiting customers.");
    }

    const stepDoc = waitingSnap.docs[0];
    const step = stepDoc.data();

    const tokenRef = organizationRef.collection("tokens").doc(step.tokenId);

    await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const counter = counterSnap.data();

      transaction.update(stepDoc.ref, {
        status: "called",
        calledAt: FieldValue.serverTimestamp(),
      });

      transaction.update(tokenRef, {
        status: "called",
        currentStepId: stepDoc.id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.update(counterRef, {
        previousTokenId: counter?.currentTokenId || null,
        currentTokenId: step.tokenNumber,
        currentStepId: stepDoc.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      stepId: stepDoc.id,
      tokenNumber: step.tokenNumber,
    };
  } catch (error: any) {
    console.error("callNextCustomer failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Could not call next customer.",
    );
  }
});

export const completeCurrentService = onCall(async (request) => {
  try {
    const { organizationId, counterId, stepId } = request.data;

    if (!organizationId || !counterId || !stepId) {
      throw new HttpsError("invalid-argument", "Missing required values.");
    }

    const organizationRef = db.collection("organizations").doc(organizationId);
    const stepRef = organizationRef.collection("queueSteps").doc(stepId);
    const counterRef = organizationRef.collection("counters").doc(counterId);

    const stepSnap = await stepRef.get();

    if (!stepSnap.exists) {
      throw new HttpsError("not-found", "Step not found.");
    }

    const step = stepSnap.data();

    if (!step) {
      throw new HttpsError("not-found", "Step data not found.");
    }

    const tokenRef = organizationRef.collection("tokens").doc(step.tokenId);

    const nextStepSnap = await organizationRef
      .collection("queueSteps")
      .where("tokenId", "==", step.tokenId)
      .where("sequenceNumber", "==", step.sequenceNumber + 1)
      .limit(1)
      .get();

    const batch = db.batch();

    batch.update(stepRef, {
      status: "completed",
      completedAt: FieldValue.serverTimestamp(),
    });

    if (!nextStepSnap.empty) {
      const nextStepDoc = nextStepSnap.docs[0];

      batch.update(nextStepDoc.ref, {
        status: "waiting",
        activatedAt: FieldValue.serverTimestamp(),
      });

      batch.update(tokenRef, {
        status: "waiting",
        currentStepId: nextStepDoc.id,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      batch.update(tokenRef, {
        status: "completed",
        currentStepId: null,
        completedAt: FieldValue.serverTimestamp(),
      });
    }

    batch.update(counterRef, {
      previousTokenId: step.tokenNumber,
      currentTokenId: null,
      currentStepId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
      success: true,
    };
  } catch (error: any) {
    console.error("completeCurrentService failed:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError(
      "internal",
      error.message || "Could not complete service.",
    );
  }
});
