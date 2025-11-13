// main.js for S.H.I.E.L.D Wanted List
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.9.3/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
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
  let currentSortField = "createdAt";
  let sortDir = -1; // -1: desc, 1: asc

  const q = query(wantedsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot) => {
    wantedItems = [];
    ul.innerHTML = "";
    snapshot.forEach((doc) => {
      const data = doc.data();
      // compute ranking locally and persist to Firestore if different
      const ranked = computeRanking(data);
      // push the doc data to the list (include id)
      wantedItems.push({ id: doc.id, ...data });

      // if the stored ranking differs from computed, try to update the document
      try {
        if ((data.ranking || "") !== ranked.key) {
          // attempt to update the doc with a lightweight ranking field
          updateDoc(doc.ref, { ranking: ranked.key }).catch((err) => {
            console.warn(
              "Unable to update ranking field for document",
              doc.id,
              err.message || err
            );
          });
        }
      } catch (err) {
        // doc.ref may not be available in some query snapshot shapes; ignore failures
        console.warn(
          "Ranking persistence skipped for",
          doc.id,
          err && err.message
        );
      }
    });
    renderWanted(wantedItems);
  });

  searchInput.addEventListener("input", () => {
    renderWanted(filterBySearch());
  });

  // wire up sort controls
  const sortSelect = document.getElementById("sort-select");
  const sortToggle = document.getElementById("sort-toggle");
  sortSelect.addEventListener("change", (e) => {
    currentSortField = e.target.value;
    renderWanted(filterBySearch());
  });
  sortToggle.addEventListener("click", () => {
    sortDir = sortDir * -1;
    sortToggle.textContent = sortDir === -1 ? "⬆" : "⬇";
    renderWanted(filterBySearch());
  });

  function filterBySearch() {
    const raw = String(searchInput.value || "").toLowerCase().trim();

    // detect explicit ranking tokens typed by the user
    const rankTokens = ["low", "moderate", "high"];
    const parts = raw.split(/\s+/).filter(Boolean);
    let rankFilter = null;
    const textParts = [];
    parts.forEach((p) => {
      if (rankTokens.includes(p)) rankFilter = p;
      else textParts.push(p);
    });

    const term = textParts.join(" ");

    return wantedItems.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const reason = String(item.reason || "").toLowerCase();

      // if there's no textual term, treat text match as true (so rank-only searches work)
      const matchesTerm = term === "" ? true : name.includes(term) || reason.includes(term);

      // determine the item's ranking (prefer stored `item.ranking`, otherwise compute)
      const itemRank = String((item.ranking || (computeRanking && computeRanking(item).key) || "")).toLowerCase();
      const matchesRank = rankFilter === null ? true : itemRank === rankFilter;

      return matchesTerm && matchesRank;
    });
  }

  function renderWanted(list) {
    ul.innerHTML = "";

    // decorate each item with ranking info
    const decorated = list.map((item) => ({
      ...item,
      _rankingInfo: computeRanking(item),
    }));

    // sort decorated list
    decorated.sort((a, b) => compareByField(a, b, currentSortField, sortDir));

    decorated.forEach((data) => {
      const li = document.createElement("li");
      li.className = "wanted-item";
      li.dataset.id = data.id || "";
      li.innerHTML = `
        <div class="card-head">
          <strong>${escapeHtml(data.name)}</strong>
          <span class="badge ${data._rankingInfo.key}">${
        data._rankingInfo.label
      }</span>
        </div>
        <div class="reason">${escapeHtml(data.reason)}</div>
      `;

      // explanation reveal on click
      li.addEventListener("click", () => {
        showExplanation(data);
        // highlight selected
        document
          .querySelectorAll("#wanted-list li")
          .forEach((n) => n.classList.remove("selected"));
        li.classList.add("selected");
      });

      ul.appendChild(li);
    });
  }

  function showExplanation(data) {
    const panel = document.getElementById("explanation-panel");
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
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function compareByField(a, b, field, dir) {
    // handle ranking specially to sort Low->High or reverse
    if (field === "ranking") {
      const rankOrder = { low: 1, moderate: 2, high: 3 };
      return (
        (rankOrder[
          (a._rankingInfo && a._rankingInfo.key) || a.ranking || "low"
        ] -
          rankOrder[
            (b._rankingInfo && b._rankingInfo.key) || b.ranking || "low"
          ]) *
        dir
      );
    }
    if (field === "createdAt") {
      const atA = toDate(a.createdAt).getTime();
      const atB = toDate(b.createdAt).getTime();
      return (atA - atB) * dir;
    }
    const va = String(a[field] || "").toLowerCase();
    const vb = String(b[field] || "").toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  }

  function toDate(val) {
    if (!val) return new Date(0);
    if (val.toDate && typeof val.toDate === "function") return val.toDate();
    return new Date(val);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(
      /[&<>\"']/g,
      (s) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[s])
    );
  }

  // Enhanced school-friendly concern ranking
  function computeRanking(item) {
    const reason = String(item.reason || "")
      .toLowerCase()
      .trim();
    let score = 0;

    // High concern keywords — serious safety or aggression indicators
    const high = [
      "threat",
      "threats",
      "threaten",
      "threatened",
      "threatening",
      "attack",
      "attacks",
      "attacked",
      "attacking",
      "assault",
      "assaults",
      "assaulted",
      "assaulting",
      "weapon",
      "weapons",
      "violence",
      "violent",
      "violently",
      "abuse",
      "abuses",
      "abused",
      "abusing",
      "abusive",
      "fight",
      "fights",
      "fighting",
      "fought",
      "harm",
      "harms",
      "harmed",
      "harming",
      "harmful",
      "injury",
      "injuries",
      "injure",
      "injures",
      "injured",
      "injuring",
      "bully",
      "bullies",
      "bullied",
      "bullying",
      "danger",
      "dangers",
      "dangerous",
      "endanger",
      "endangered",
      "endangering",
      "punch",
      "punches",
      "punched",
      "punching",
      "hit",
      "hits",
      "hitting",
      "kick",
      "kicks",
      "kicked",
      "kicking",
      "hurt",
      "hurts",
      "hurting",
      "hurtful",
      "self-harm",
      "selfharm",
      "self harming",
      "self harmed",
      "self harming",
      "suicide",
      "suicidal",
      "intimidate",
      "intimidates",
      "intimidated",
      "intimidating",
      "intimidation",
    ];

    // Medium concern — behavioral, disciplinary, or recurring conflict
    const medium = [
      "misbehave",
      "misbehaves",
      "misbehaved",
      "misbehaving",
      "misbehavior",
      "disrespect",
      "disrespects",
      "disrespected",
      "disrespecting",
      "disrespectful",
      "disrupt",
      "disrupts",
      "disrupted",
      "disrupting",
      "disruptive",
      "disruption",
      "argue",
      "argues",
      "argued",
      "arguing",
      "argument",
      "arguments",
      "harass",
      "harasses",
      "harassed",
      "harassing",
      "harassment",
      "dispute",
      "disputes",
      "disputed",
      "disputing",
      "conflict",
      "conflicts",
      "conflicted",
      "conflicting",
      "ignore",
      "ignores",
      "ignored",
      "ignoring",
      "noncompliant",
      "noncompliance",
      "rude",
      "rudely",
      "rudeness",
      "yell",
      "yells",
      "yelled",
      "yelling",
      "shout",
      "shouts",
      "shouted",
      "shouting",
      "blame",
      "blames",
      "blamed",
      "blaming",
      "refuse",
      "refuses",
      "refused",
      "refusing",
      "refusal",
      "defiant",
      "defy",
      "defies",
      "defied",
      "defying",
      "defiance",
      "anger",
      "angry",
      "angered",
      "angering",
      "tension",
      "tensions",
      "tense",
      "tensed",
    ];

    // Low concern — mentions of involvement or mild social issues
    const low = [
      "support",
      "supports",
      "supported",
      "supporting",
      "supportive",
      "ally",
      "allies",
      "allied",
      "seen with",
      "was seen with",
      "were seen with",
      "associate",
      "associates",
      "associated",
      "associating",
      "association",
      "witness",
      "witnesses",
      "witnessed",
      "witnessing",
      "rumor",
      "rumors",
      "rumored",
      "report",
      "reports",
      "reported",
      "reporting",
      "concern",
      "concerns",
      "concerned",
      "concerning",
      "conversation",
      "conversations",
      "discussion",
      "discussions",
      "discuss",
      "discusses",
      "discussed",
      "discussing",
    ];

    // Positive / protective keywords — may lower concern slightly
    const positive = [
      "apology",
      "apologies",
      "apologize",
      "apologizes",
      "apologized",
      "apologizing",
      "improve",
      "improves",
      "improved",
      "improving",
      "improvement",
      "improvements",
      "help",
      "helps",
      "helped",
      "helping",
      "helpful",
      "resolve",
      "resolves",
      "resolved",
      "resolving",
      "resolution",
      "resolutions",
      "calm",
      "calms",
      "calmed",
      "calming",
      "calmly",
      "cooperate",
      "cooperates",
      "cooperated",
      "cooperating",
      "cooperation",
      "cooperative",
      "assist",
      "assists",
      "assisted",
      "assisting",
      "assistance",
      "mentor",
      "mentors",
      "mentored",
      "mentoring",
      "mentorship",
      "positive",
      "positivity",
      "progress",
      "progresses",
      "progressed",
      "progressing",
      "progressive",
    ];

    // Score accumulation
    high.forEach((k) => {
      if (reason.includes(k)) score += 3;
    });
    medium.forEach((k) => {
      if (reason.includes(k)) score += 2;
    });
    low.forEach((k) => {
      if (reason.includes(k)) score += 1;
    });
    positive.forEach((k) => {
      if (reason.includes(k)) score -= 1;
    });

    // Boost if related to leadership or staff responsibility
    if (
      reason.includes("director") ||
      reason.includes("employee") ||
      reason.includes("manager") ||
      reason.includes("teacher")
    ) {
      score += 1;
    }

    // Clamp to a positive range
    if (score <= 0) score = 0;

    // Final classification
    if (score <= 1) {
      return {
        key: "low",
        label: "Low",
        explanation:
          "This entry shows a low level of concern. Continue normal monitoring and positive engagement.",
      };
    }
    if (score <= 4) {
      return {
        key: "moderate",
        label: "Moderate",
        explanation:
          "This entry indicates a moderate level of concern. There may be conflicts or repeated behavior. Consider follow-up and guidance.",
      };
    }
    return {
      key: "high",
      label: "High",
      explanation:
        "This entry suggests a high level of concern, possibly involving safety or aggression. Take immediate action and inform appropriate staff.",
    };
  }
});
