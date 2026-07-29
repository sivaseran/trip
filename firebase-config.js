/* =========================================================
   FIREBASE CONFIG — Scotland Family Road Trip
   Public client identifiers, not secrets — safe to commit.
   databaseURL is REQUIRED for live location to work.
   Find it at: Firebase Console → Build → Realtime Database
   (shown at the top of that page once the DB is created).
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyATFkrKz1xPDVISGlyk-ntg-eEDp2y8H5Y",
  authDomain: "scotland-trip-4f0b2.firebaseapp.com",
  databaseURL: "https://scotland-trip-4f0b2-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "scotland-trip-4f0b2",
  storageBucket: "scotland-trip-4f0b2.firebasestorage.app",
  messagingSenderId: "546610944504",
  appId: "1:546610944504:web:7d57eeee555361f715de0d"
};

// Live location is disabled automatically until databaseURL is filled in,
// so the rest of the app works fine even before Firebase is fully wired up.
const LIVE_LOCATION_ENABLED = firebaseConfig.databaseURL !== "REPLACE_ME";
