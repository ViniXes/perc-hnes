import { getFirestore, terminate } from "firebase/firestore";
import app from "@/lib/firebase";

export const db = getFirestore(app);

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
