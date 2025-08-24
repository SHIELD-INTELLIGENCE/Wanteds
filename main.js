// main.js for S.H.I.E.L.D Wanted List
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.9.3/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/9.9.3/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbH5YC-Kf7S0jI_gE311rjFtHI6EAbKI8",
  authDomain: "feeds-a8b14.firebaseapp.com",
  projectId: "feeds-a8b14",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const wantedsRef = collection(db, "wanteds");

document.addEventListener("DOMContentLoaded", () => {
  const ul = document.getElementById("wanted-list");
  const searchInput = document.getElementById("search-input");

  let wantedItems = [];

  const q = query(wantedsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, snapshot => {
    wantedItems = [];
    ul.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      wantedItems.push({ ...data });
    });
    renderWanted(wantedItems);
  });

  searchInput.addEventListener("input", () => {
    const term = searchInput.value.toLowerCase();
    const filtered = wantedItems.filter(item =>
      item.name.toLowerCase().includes(term) || item.reason.toLowerCase().includes(term)
    );
    renderWanted(filtered);
  });

  function renderWanted(list) {
    ul.innerHTML = "";
    list.forEach(data => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${data.name}</strong><br>${data.reason}`;
      ul.appendChild(li);
    });
  }
});
