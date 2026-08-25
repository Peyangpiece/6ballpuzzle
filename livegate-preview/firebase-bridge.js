import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getDatabase, ref, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const config = window.LIVEGATE_FIREBASE_CONFIG;
const bridge = {
  connected: false,
  uid: null,
  async savePreference(key, value) {
    if (!this.connected || !this.uid) return;
    const db = getDatabase(app);
    await update(ref(db, `livegate-next/users/${this.uid}`), {
      [key]: value,
      updatedAt: serverTimestamp()
    });
  }
};
window.liveGateFirebase = bridge;

let app;
try {
  app = initializeApp(config);
  const auth = getAuth(app);
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    bridge.connected = true;
    bridge.uid = user.uid;
    document.documentElement.dataset.firebase = "connected";
    try {
      const db = getDatabase(app);
      const snap = await get(ref(db, `livegate-next/users/${user.uid}`));
      if (snap.exists() && typeof window.applyFirebaseProfile === "function") {
        window.applyFirebaseProfile(snap.val());
      }
    } catch (error) {
      console.warn("Live Gate Firebase profile read skipped:", error?.message || error);
    }
  });
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
} catch (error) {
  console.warn("Live Gate Firebase initialization skipped:", error?.message || error);
  document.documentElement.dataset.firebase = "offline";
}
