// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyADEBDeD4XW14s_unYcXuu86IOcEKMlTsw",
  authDomain: "ourlist-67886.firebaseapp.com",
  projectId: "ourlist-67886",
  storageBucket: "ourlist-67886.firebasestorage.app",
  messagingSenderId: "1058644199219",
  appId: "1:1058644199219:web:889c5841854f02fd2be046"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
