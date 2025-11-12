// main.js for S.H.I.E.L.D Wanted List
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.9.3/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot
  , updateDoc
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
  let currentSortField = 'createdAt';
  let sortDir = -1; // -1: desc, 1: asc

  const q = query(wantedsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, snapshot => {
    wantedItems = [];
    ul.innerHTML = "";
    snapshot.forEach(doc => {
      const data = doc.data();
      // compute ranking locally and persist to Firestore if different
      const ranked = computeRanking(data);
      // push the doc data to the list (include id)
      wantedItems.push({ id: doc.id, ...data });

      // if the stored ranking differs from computed, try to update the document
      try {
        if((data.ranking || '') !== ranked.key){
          // attempt to update the doc with a lightweight ranking field
          updateDoc(doc.ref, { ranking: ranked.key }).catch(err => {
            console.warn('Unable to update ranking field for document', doc.id, err.message || err);
          });
        }
      } catch (err) {
        // doc.ref may not be available in some query snapshot shapes; ignore failures
        console.warn('Ranking persistence skipped for', doc.id, err && err.message);
      }
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

  // wire up sort controls
  const sortSelect = document.getElementById('sort-select');
  const sortToggle = document.getElementById('sort-toggle');
  sortSelect.addEventListener('change', (e) => {
    currentSortField = e.target.value;
    renderWanted(filterBySearch());
  });
  sortToggle.addEventListener('click', () => {
    sortDir = sortDir * -1;
    sortToggle.textContent = sortDir === -1 ? '⬆' : '⬇';
    renderWanted(filterBySearch());
  });

  function filterBySearch(){
    const term = searchInput.value.toLowerCase();
    return wantedItems.filter(item =>
      item.name.toLowerCase().includes(term) || item.reason.toLowerCase().includes(term)
    );
  }

  function renderWanted(list) {
    ul.innerHTML = "";

    // decorate each item with ranking info
    const decorated = list.map(item => ({
      ...item,
      _rankingInfo: computeRanking(item)
    }));

    // sort decorated list
    decorated.sort((a, b) => compareByField(a, b, currentSortField, sortDir));

    decorated.forEach(data => {
      const li = document.createElement("li");
      li.className = 'wanted-item';
      li.dataset.id = data.id || '';
      li.innerHTML = `
        <div class="card-head">
          <strong>${escapeHtml(data.name)}</strong>
          <span class="badge ${data._rankingInfo.key}">${data._rankingInfo.label}</span>
        </div>
        <div class="reason">${escapeHtml(data.reason)}</div>
      `;

      // explanation reveal on click
      li.addEventListener('click', () => {
        showExplanation(data);
        // highlight selected
        document.querySelectorAll('#wanted-list li').forEach(n => n.classList.remove('selected'));
        li.classList.add('selected');
      });

      ul.appendChild(li);
    });
  }

  function showExplanation(data){
    const panel = document.getElementById('explanation-panel');
    const info = data._rankingInfo;
    panel.innerHTML = `
      <div class="explanation-card">
        <div class="ex-head">
          <strong>${escapeHtml(data.name)}</strong>
          <span class="badge ${info.key}">${info.label}</span>
        </div>
        <div class="ex-reason">${escapeHtml(data.reason)}</div>
        <div class="ex-text">${escapeHtml(info.explanation)}</div>
      </div>
    `;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function compareByField(a, b, field, dir){
    // handle ranking specially to sort Low->High or reverse
    if(field === 'ranking'){
      const rankOrder = { 'low': 1, 'moderate': 2, 'high': 3 };
      return (rankOrder[(a._rankingInfo && a._rankingInfo.key) || a.ranking || 'low'] - rankOrder[(b._rankingInfo && b._rankingInfo.key) || b.ranking || 'low']) * dir;
    }
    if(field === 'createdAt'){
      const atA = toDate(a.createdAt).getTime();
      const atB = toDate(b.createdAt).getTime();
      return (atA - atB) * dir;
    }
    const va = String(a[field] || '').toLowerCase();
    const vb = String(b[field] || '').toLowerCase();
    if(va < vb) return -1 * dir;
    if(va > vb) return 1 * dir;
    return 0;
  }

  function toDate(val){
    if(!val) return new Date(0);
    if(val.toDate && typeof val.toDate === 'function') return val.toDate();
    return new Date(val);
  }

  function escapeHtml(str){
    if(!str) return '';
    return String(str).replace(/[&<>\"']/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[s]));
  }

  // Basic school-friendly ranking computation
  function computeRanking(item){
    const reason = String(item.reason || '').toLowerCase();
    let score = 0;

    // stronger keywords
    const high = ['threat', 'attack', 'assault', 'weapon', 'violence', 'abuse'];
    const medium = ['misbehav', 'insult', 'disrespect', 'harass', 'argue', 'dispute', 'conflict'];
    const low = ['support', 'ally', 'seen with', 'associate', 'witness'];

    high.forEach(k => { if(reason.includes(k)) score += 3; });
    medium.forEach(k => { if(reason.includes(k)) score += 2; });
    low.forEach(k => { if(reason.includes(k)) score += 1; });

    // small boost if mentions leadership or employee
    if(reason.includes('director') || reason.includes('employee') || reason.includes('manager')) score += 1;

    // clamp
    if(score <= 1) {
      return {
        key: 'low',
        label: 'Low',
        explanation: 'This entry shows a low level of concern based on the reason provided. Continue normal monitoring and, if needed, document further incidents.'
      };
    }
    if(score <= 3){
      return {
        key: 'moderate',
        label: 'Moderate',
        explanation: 'This entry indicates moderate concern: the reason mentions conflicts or repeated issues. Consider follow-up and closer observation.'
      };
    }
    return {
      key: 'high',
      label: 'High',
      explanation: 'This entry indicates a higher level of concern due to words associated with threats or harm. Take appropriate safety steps and notify relevant staff.'
    };
  }
});
