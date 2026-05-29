import { getStorage } from "firebase/storage";
import app from "@/lib/firebase";

export const storage = getStorage(app);
