/* ═══════════════════════════════════════════════════
   HDP ONLINE — GAME CLIENT
═══════════════════════════════════════════════════ */

const socket = io();

// ─── ESTADO LOCAL ────────────────────────────────
let myId = null;
let myRoom = null;
let myHand = [];
let isJudge = false;
let selectedCards = [];
let submitted = false;

// ─── HELPERS DOM ─────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = $(`screen-${name}`);
  if (el) el.classList.add("active");
}

function showToast(msg, duration = 2800) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), duration);
}

function avatarColor(index) {
  return `av-${index % 8}`;
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

// ─── LOBBY ────────────────────────────────────────
$("btn-create").addEventListener("click", () => {
  const name = $("input-name").value.trim();
  if (!name || name.length < 2) return setLobbyError("Ingresá tu nombre (mín. 2 caracteres).");
  clearLobbyError();
  socket.emit("createRoom", { playerName: name }, (res) => {
    if (res.error) return setLobbyError(res.error);
    myId = res.myId;
    myRoom = res.room;
    enterWaitingRoom();
  });
});

$("btn-join").addEventListener("click", () => {
  const name = $("input-name").value.trim();
  const code = $("input-code").value.trim();
  if (!name || name.length < 2) return setLobbyError("Ingresá tu nombre.");
  if (!code) return setLobbyError("Ingresá el código de sala.");
  clearLobbyError();
  socket.emit("joinRoom", { code, playerName: name }, (res) => {
    if (res.error) return setLobbyError(res.error);
    myId = res.myId;
    myRoom = res.room;
    enterWaitingRoom();
  });
});

$("input-name").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-create").click(); });
$("input-code").addEventListener("keydown", e => { if (e.key === "Enter") $("btn-join").click(); });

function setLobbyError(msg) { $("lobby-error").textContent = msg; }
function clearLobbyError() { $("lobby-error").textContent = ""; }

// ─── SALA DE ESPERA ───────────────────────────────
function enterWaitingRoom() {
  showScreen("waiting");
  renderWaitingRoom(myRoom);
}

function renderWaitingRoom(room) {
  $("display-room-code").textContent = room.code;
  $("player-count").textContent = room.players.length;

  const list = $("players-list");
  list.innerHTML = "";
  room.players.forEach((p, i) => {
    const li = document.createElement("li");
    const av = document.createElement("div");
    av.className = `player-avatar ${avatarColor(i)}`;
    av.textContent = initials(p.name);
    li.appendChild(av);
    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;
    li.appendChild(nameSpan);
    if (p.id === myId) {
      const you = document.createElement("span");
      you.style.cssText = "font-size:0.7rem;color:var(--gray-light);margin-left:4px";
      you.textContent = "(tú)";
      li.appendChild(you);
    }
    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "player-badge";
      badge.textContent = "HOST";
      li.appendChild(badge);
    }
    list.appendChild(li);
  });

  const me = room.players.find(p => p.id === myId);
  const startBtn = $("btn-start-game");
  const waitMsg = $("waiting-msg");
  if (me && me.isHost) {
    startBtn.classList.remove("hidden");
    waitMsg.classList.add("hidden");
  } else {
    startBtn.classList.add("hidden");
    waitMsg.classList.remove("hidden");
  }
}

$("btn-copy-code").addEventListener("click", () => {
  const code = $("display-room-code").textContent;
  navigator.clipboard.writeText(code).then(() => showToast("✅ Código copiado: " + code));
});

$("btn-start-game").addEventListener("click", () => {
  socket.emit("startGame", {}, (res) => {
    if (res && res.error) showToast("❌ " + res.error);
  });
});

// ─── GAME SCREEN ──────────────────────────────────
function renderGameScreen(room) {
  // Header
  $("header-room-code").textContent = "Sala " + room.code;

  // Scoreboard
  const sb = $("scoreboard");
  sb.innerHTML = "";
  room.players.forEach(p => {
    const pill = document.createElement("div");
    pill.className = "score-pill" + (p.isJudge ? " is-judge" : "");
    pill.innerHTML = `<span>${initials(p.name)}</span> <span class="score-pts">${p.score}</span>${p.isJudge ? " 👨‍⚖️" : ""}`;
    pill.title = p.name;
    sb.appendChild(pill);
  });

  // Carta negra
  if (room.currentBlackCard) {
    $("black-card-text").textContent = room.currentBlackCard.text;
  }

  // Status bar
  const me = room.players.find(p => p.id === myId);
  const judge = room.players.find(p => p.isJudge);
  const judgeLabel = judge ? (judge.id === myId ? "Sos el juez esta ronda" : `Juez: ${judge.name}`) : "";
  $("game-status-bar").textContent = judgeLabel;

  // Hide all panels
  ["panel-submit", "panel-judge-wait", "panel-judging", "panel-round-end"].forEach(id => {
    $(id).classList.add("hidden");
  });

  if (room.state === "playing") {
    if (isJudge) {
      showJudgeWaitPanel(room);
    } else {
      if (submitted) {
        $("waiting-others").classList.remove("hidden");
      } else {
        showSubmitPanel(room);
      }
    }
  } else if (room.state === "judging") {
    if (isJudge) {
      showJudgingPanel(room);
    } else {
      // Non-judge sees judging panel as read-only
      showJudgingPanelReadOnly(room);
    }
  } else if (room.state === "roundEnd") {
    showRoundEndPanel(room);
  }
}

function showSubmitPanel(room) {
  const panel = $("panel-submit");
  panel.classList.remove("hidden");
  $("waiting-others").classList.add("hidden");

  selectedCards = [];
  renderHand();

  const needed = room.blanksNeeded;
  updateSelectionCounter(needed);
  $("btn-submit-cards").disabled = true;
}

function renderHand() {
  const container = $("hand-cards");
  container.innerHTML = "";
  const needed = myRoom ? myRoom.blanksNeeded : 1;

  myHand.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className = "card card-white";
    if (submitted) el.classList.add("disabled");

    const selIdx = selectedCards.findIndex(c => c.text === card.text);
    if (selIdx !== -1) {
      el.classList.add("selected");
      const badge = document.createElement("div");
      badge.className = "card-order-badge";
      badge.textContent = selIdx + 1;
      el.appendChild(badge);
    }

    const txt = document.createElement("span");
    txt.textContent = card.text;
    el.appendChild(txt);

    el.addEventListener("click", () => {
      if (submitted) return;
      toggleCardSelection(card, needed);
      renderHand();
    });

    container.appendChild(el);
  });
}

function toggleCardSelection(card, needed) {
  const idx = selectedCards.findIndex(c => c.text === card.text);
  if (idx !== -1) {
    selectedCards.splice(idx, 1);
  } else {
    if (selectedCards.length < needed) {
      selectedCards.push(card);
    } else if (needed === 1) {
      selectedCards = [card];
    } else {
      showToast(`Máximo ${needed} cartas. Deseleccioná una primero.`);
      return;
    }
  }
  updateSelectionCounter(needed);
  $("btn-submit-cards").disabled = selectedCards.length !== needed;

  // Preview
  const preview = $("selected-preview");
  preview.innerHTML = "";
  selectedCards.forEach((c, i) => {
    const p = document.createElement("div");
    p.className = "preview-card";
    p.textContent = (needed > 1 ? `${i+1}. ` : "") + c.text;
    preview.appendChild(p);
  });
}

function updateSelectionCounter(needed) {
  $("selection-counter").textContent = `${selectedCards.length} / ${needed}`;
}

$("btn-submit-cards").addEventListener("click", () => {
  if (selectedCards.length === 0) return;
  socket.emit("submitCards", { cards: selectedCards }, (res) => {
    if (res.error) return showToast("❌ " + res.error);
    submitted = true;
    $("panel-submit").classList.add("hidden");
    $("waiting-others").classList.remove("hidden");
    $("panel-submit").classList.remove("hidden"); // keep visible for waiting msg
    renderHand();
    $("btn-submit-cards").disabled = true;
    showToast("✅ ¡Cartas enviadas!");
  });
});

function showJudgeWaitPanel(room) {
  const panel = $("panel-judge-wait");
  panel.classList.remove("hidden");

  const prog = $("submissions-progress");
  prog.innerHTML = "";
  room.players.filter(p => !p.isJudge).forEach(p => {
    const row = document.createElement("div");
    row.className = "progress-row";
    const dot = document.createElement("div");
    dot.className = "progress-dot" + (p.submitted ? " done" : "");
    const name = document.createElement("span");
    name.textContent = p.name + (p.submitted ? " ✅" : " ...");
    row.appendChild(dot);
    row.appendChild(name);
    prog.appendChild(row);
  });
}

function showJudgingPanel(room) {
  const panel = $("panel-judging");
  panel.classList.remove("hidden");

  const grid = $("submissions-grid");
  grid.innerHTML = "";

  room.submissions.forEach((sub, i) => {
    const card = document.createElement("div");
    card.className = "submission-card";
    sub.cards.forEach((c, j) => {
      if (j > 0) {
        const sep = document.createElement("hr");
        sep.className = "submission-sep";
        card.appendChild(sep);
      }
      const t = document.createElement("span");
      t.textContent = c.text;
      card.appendChild(t);
    });
    card.addEventListener("click", () => {
      socket.emit("judgePick", { index: i }, (res) => {
        if (res && res.error) showToast("❌ " + res.error);
      });
    });
    grid.appendChild(card);
  });
}

function showJudgingPanelReadOnly(room) {
  const panel = $("panel-judging");
  panel.classList.remove("hidden");
  const title = panel.querySelector(".panel-title");
  if (title) title.textContent = "El juez está eligiendo... 🤔";

  const grid = $("submissions-grid");
  grid.innerHTML = "";
  room.submissions.forEach((sub) => {
    const card = document.createElement("div");
    card.className = "submission-card";
    card.style.cursor = "default";
    sub.cards.forEach((c, j) => {
      if (j > 0) { const sep = document.createElement("hr"); sep.className = "submission-sep"; card.appendChild(sep); }
      const t = document.createElement("span"); t.textContent = c.text; card.appendChild(t);
    });
    grid.appendChild(card);
  });
}

function showRoundEndPanel(room) {
  const panel = $("panel-round-end");
  panel.classList.remove("hidden");

  $("round-winner-banner").textContent = `🎉 ¡Ganó ${room.winnerName}!`;

  // Mostrar cartas ganadoras
  const display = $("winning-cards-display");
  display.innerHTML = "";
  if (room.roundWinner) {
    const winningSub = room.submissions.find(s => s.playerId === room.roundWinner);
    if (winningSub) {
      winningSub.cards.forEach(c => {
        const el = document.createElement("div");
        el.className = "winning-card";
        el.textContent = c.text;
        display.appendChild(el);
      });
    }
  }

  const me = room.players.find(p => p.id === myId);
  const nextBtn = $("btn-next-round");
  if (me && me.isHost) {
    nextBtn.classList.remove("hidden");
  } else {
    nextBtn.classList.add("hidden");
  }
}

$("btn-next-round").addEventListener("click", () => {
  socket.emit("nextRound", {}, (res) => {
    if (res && res.error) showToast("❌ " + res.error);
  });
});

// ─── GAME OVER ────────────────────────────────────
function renderGameOver(room) {
  showScreen("gameover");
  $("gameover-winner").textContent = room.gameWinner;

  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const ranking = $("final-ranking");
  ranking.innerHTML = "";
  sorted.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "rank-row";
    const pos = document.createElement("span");
    pos.className = "rank-pos" + (i === 0 ? " gold" : "");
    pos.textContent = i + 1;
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = p.name;
    const pts = document.createElement("span");
    pts.className = "rank-pts";
    pts.textContent = p.score + " pts";
    row.append(pos, name, pts);
    ranking.appendChild(row);
  });

  const me = room.players.find(p => p.id === myId);
  $("btn-restart").style.display = (me && me.isHost) ? "block" : "none";
}

$("btn-restart").addEventListener("click", () => {
  socket.emit("restartGame", {}, (res) => {
    if (res && res.error) showToast("❌ " + res.error);
  });
});

// ─── SOCKET EVENTS ────────────────────────────────
socket.on("roomUpdate", (room) => {
  myRoom = room;
  const me = room.players.find(p => p.id === myId);

  if (room.state === "waiting") {
    renderWaitingRoom(room);
    return;
  }

  if (room.state === "gameOver") {
    renderGameOver(room);
    return;
  }

  // Cambio de estado: ir a pantalla de juego
  showScreen("game");
  renderGameScreen(room);
});

socket.on("handUpdate", (data) => {
  myHand = data.hand;
  isJudge = data.isJudge;
  submitted = false;
  selectedCards = [];
  if (myRoom && myRoom.state === "playing" && !isJudge) {
    renderHand();
  }
});

socket.on("allSubmitted", ({ submissions }) => {
  if (myRoom) myRoom.submissions = submissions;
});

socket.on("playerLeft", ({ message }) => {
  showToast("👋 " + message);
});

socket.on("disconnect", () => {
  showToast("❌ Desconectado del servidor. Recargá la página.");
});

socket.on("connect", () => {
  if (myId) showToast("✅ Reconectado.");
});

// ─── INIT ─────────────────────────────────────────
showScreen("lobby");
