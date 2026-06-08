import { getFirestore, setLogLevel, terminate } from "firebase/firestore";
import app, { firestoreDatabaseId } from "@/lib/firebase";

// The page already handles Firestore availability errors explicitly.
setLogLevel("silent");

export const db = getFirestore(app, firestoreDatabaseId);

let firestoreTerminated = false;

export async function shutdownFirestore() {
  if (firestoreTerminated) {
    return;
  }

  firestoreTerminated = true;

  try {
    await terminate(db);
  } catch {
    // Ignore repeated termination attempts and shutdown races.
  }
}
