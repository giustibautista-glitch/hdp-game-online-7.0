const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

// Cargar cartas desde JSON
let blackCardsOriginal = require("./data/blackCards.json");
let whiteCardsOriginal = require("./data/whiteCards.json");

// Estado global de salas
const rooms = {};

// ─── UTILS ────────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomCode() {
  let code;
  do { code = Math.floor(1000 + Math.random() * 9000).toString(); }
  while (rooms[code]);
  return code;
}

function countBlanks(text) {
  return (text.match(/____/g) || []).length;
}

function dealCards(room, player, count = 10) {
  const hand = player.hand || [];
  while (hand.length < count && room.whiteDeck.length > 0) {
    hand.push(room.whiteDeck.pop());
  }
  player.hand = hand;
}

function getPublicRoom(room) {
  return {
    code: room.code,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isHost: p.isHost,
      isJudge: p.isJudge,
      submitted: !!p.submitted
    })),
    state: room.state,
    currentBlackCard: room.currentBlackCard,
    blanksNeeded: room.blanksNeeded,
    submissions: room.state === "judging" ? room.submissions : [],
    roundWinner: room.roundWinner,
    winnerName: room.winnerName,
    targetScore: room.targetScore,
    gameWinner: room.gameWinner
  };
}

// ─── GAME LOGIC ───────────────────────────────────────────────────────────────

function createRoom(hostSocket, playerName) {
  const code = generateRoomCode();
  const host = {
    id: hostSocket.id,
    name: playerName,
    score: 0,
    isHost: true,
    isJudge: false,
    hand: [],
    submitted: null
  };
  rooms[code] = {
    code,
    players: [host],
    state: "waiting", // waiting | playing | judging | roundEnd | gameOver
    blackDeck: shuffle(blackCardsOriginal),
    whiteDeck: shuffle(whiteCardsOriginal.map(t => ({ text: t }))),
    currentBlackCard: null,
    blanksNeeded: 1,
    submissions: [],
    judgeIndex: 0,
    roundWinner: null,
    winnerName: null,
    targetScore: 8,
    gameWinner: null
  };
  hostSocket.join(code);
  hostSocket.roomCode = code;
  return rooms[code];
}

function joinRoom(socket, code, playerName) {
  const room = rooms[code];
  if (!room) return { error: "Sala no encontrada." };
  if (room.state !== "waiting") return { error: "La partida ya comenzó." };
  if (room.players.length >= 8) return { error: "La sala está llena (máx. 8 jugadores)." };
  if (room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase())) {
    return { error: "Ese nombre ya está en uso en esta sala." };
  }
  const player = { id: socket.id, name: playerName, score: 0, isHost: false, isJudge: false, hand: [], submitted: null };
  room.players.push(player);
  socket.join(code);
  socket.roomCode = code;
  return { room };
}

function startGame(room) {
  if (room.players.length < 2) return { error: "Se necesitan al menos 2 jugadores." };
  room.state = "playing";
  room.judgeIndex = 0;
  room.players.forEach(p => { p.score = 0; p.hand = []; p.submitted = null; p.isJudge = false; });
  room.blackDeck = shuffle(blackCardsOriginal);
  room.whiteDeck = shuffle(whiteCardsOriginal.map(t => ({ text: t })));
  startRound(room);
}

function startRound(room) {
  room.state = "playing";
  room.submissions = [];
  room.roundWinner = null;
  room.winnerName = null;

  // Asignar juez
  room.players.forEach((p, i) => { p.isJudge = (i === room.judgeIndex); p.submitted = null; });

  // Sacar carta negra
  if (room.blackDeck.length === 0) room.blackDeck = shuffle(blackCardsOriginal);
  room.currentBlackCard = room.blackDeck.pop();
  room.blanksNeeded = countBlanks(room.currentBlackCard.text);

  // Repartir cartas a los no-jueces
  room.players.forEach(p => {
    if (!p.isJudge) dealCards(room, p, 10);
  });
}

function submitCards(room, playerId, cards) {
  const player = room.players.find(p => p.id === playerId);
  if (!player || player.isJudge) return { error: "No puedes enviar cartas." };
  if (player.submitted) return { error: "Ya enviaste tus cartas." };
  if (cards.length !== room.blanksNeeded) return { error: `Debes enviar ${room.blanksNeeded} carta(s).` };

  // Quitar cartas de la mano
  for (const card of cards) {
    const idx = player.hand.findIndex(c => c.text === card.text);
    if (idx === -1) return { error: "Carta no encontrada en tu mano." };
    player.hand.splice(idx, 1);
  }

  player.submitted = cards;
  room.submissions.push({ playerId, playerName: player.name, cards });

  // Verificar si todos enviaron
  const nonJudges = room.players.filter(p => !p.isJudge);
  if (room.submissions.length === nonJudges.length) {
    room.state = "judging";
    room.submissions = shuffle(room.submissions);
    return { allSubmitted: true };
  }
  return { ok: true };
}

function judgePick(room, judgeId, submissionIndex) {
  const judge = room.players.find(p => p.id === judgeId);
  if (!judge || !judge.isJudge) return { error: "No eres el juez." };
  if (room.state !== "judging") return { error: "No es momento de juzgar." };

  const winner = room.submissions[submissionIndex];
  if (!winner) return { error: "Selección inválida." };

  const winnerPlayer = room.players.find(p => p.id === winner.playerId);
  if (winnerPlayer) winnerPlayer.score += 1;

  room.roundWinner = winner.playerId;
  room.winnerName = winner.playerName;
  room.state = "roundEnd";

  // Verificar ganador
  const gameWinner = room.players.find(p => p.score >= room.targetScore);
  if (gameWinner) {
    room.state = "gameOver";
    room.gameWinner = gameWinner.name;
  }

  return { ok: true };
}

function nextRound(room) {
  room.judgeIndex = (room.judgeIndex + 1) % room.players.length;
  startRound(room);
}

function restartGame(room) {
  room.players.forEach(p => { p.score = 0; p.hand = []; p.submitted = null; p.isJudge = false; });
  room.blackDeck = shuffle(blackCardsOriginal);
  room.whiteDeck = shuffle(whiteCardsOriginal.map(t => ({ text: t })));
  room.judgeIndex = 0;
  room.gameWinner = null;
  room.state = "playing";
  startRound(room);
}

// ─── SOCKET.IO EVENTS ─────────────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] Conectado: ${socket.id}`);

  socket.on("createRoom", ({ playerName }, cb) => {
    if (!playerName || playerName.trim().length < 2) return cb({ error: "Nombre inválido." });
    const room = createRoom(socket, playerName.trim());
    cb({ room: getPublicRoom(room), myId: socket.id });
    io.to(room.code).emit("roomUpdate", getPublicRoom(room));
  });

  socket.on("joinRoom", ({ code, playerName }, cb) => {
    if (!playerName || playerName.trim().length < 2) return cb({ error: "Nombre inválido." });
    const result = joinRoom(socket, code.trim(), playerName.trim());
    if (result.error) return cb(result);
    cb({ room: getPublicRoom(result.room), myId: socket.id });
    io.to(code.trim()).emit("roomUpdate", getPublicRoom(result.room));
  });

  socket.on("startGame", (_, cb) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return cb && cb({ error: "Sala no encontrada." });
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return cb && cb({ error: "Solo el host puede iniciar." });

    const err = startGame(room);
    if (err && err.error) return cb && cb(err);

    // Enviar manos individuales
    room.players.forEach(p => {
      io.to(p.id).emit("handUpdate", { hand: p.hand, isJudge: p.isJudge });
    });
    io.to(code).emit("roomUpdate", getPublicRoom(room));
    cb && cb({ ok: true });
  });

  socket.on("submitCards", ({ cards }, cb) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return cb({ error: "Sala no encontrada." });

    const result = submitCards(room, socket.id, cards);
    if (result.error) return cb(result);

    cb({ ok: true });
    io.to(code).emit("roomUpdate", getPublicRoom(room));

    if (result.allSubmitted) {
      io.to(code).emit("allSubmitted", { submissions: room.submissions });
    }
  });

  socket.on("judgePick", ({ index }, cb) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return cb({ error: "Sala no encontrada." });

    const result = judgePick(room, socket.id, index);
    if (result.error) return cb(result);

    io.to(code).emit("roomUpdate", getPublicRoom(room));
    cb({ ok: true });
  });

  socket.on("nextRound", (_, cb) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;
    if (room.state !== "roundEnd") return;

    nextRound(room);
    room.players.forEach(p => {
      io.to(p.id).emit("handUpdate", { hand: p.hand, isJudge: p.isJudge });
    });
    io.to(code).emit("roomUpdate", getPublicRoom(room));
    cb && cb({ ok: true });
  });

  socket.on("restartGame", (_, cb) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) return;

    restartGame(room);
    room.players.forEach(p => {
      io.to(p.id).emit("handUpdate", { hand: p.hand, isJudge: p.isJudge });
    });
    io.to(code).emit("roomUpdate", getPublicRoom(room));
    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    const room = rooms[code];
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;

    const wasHost = room.players[idx].isHost;
    const wasJudge = room.players[idx].isJudge;
    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      delete rooms[code];
      return;
    }

    // Reasignar host
    if (wasHost) room.players[0].isHost = true;

    // Si el juez se fue y el juego estaba en curso, avanzar ronda
    if (wasJudge && room.state === "playing") {
      room.judgeIndex = room.judgeIndex % room.players.length;
      startRound(room);
      room.players.forEach(p => {
        io.to(p.id).emit("handUpdate", { hand: p.hand, isJudge: p.isJudge });
      });
    }

    io.to(code).emit("roomUpdate", getPublicRoom(room));
    io.to(code).emit("playerLeft", { message: `Un jugador abandonó la partida.` });
    console.log(`[-] Desconectado: ${socket.id} de sala ${code}`);
  });
});

// Servir frontend
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

server.listen(PORT, () => console.log(`🃏 HDP Online corriendo en http://localhost:${PORT}`));
