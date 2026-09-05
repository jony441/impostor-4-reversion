const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

const wordsFile = path.join(__dirname, "words.json");
if (!fs.existsSync(wordsFile)) {
  fs.writeFileSync(wordsFile, JSON.stringify([
    "Dinosaurio", "Pizza", "Avión", "Playa", "Fútbol",
    "Minecraft", "Volcán", "Celular", "Helado", "Tiburón"
  ], null, 2));
}

const rooms = new Map();

function getWords() {
  return JSON.parse(fs.readFileSync(wordsFile, "utf8"));
}

function saveWords(words) {
  fs.writeFileSync(wordsFile, JSON.stringify(words, null, 2));
}


const BUILTIN_CATEGORIES = {
  paises: [
    "Argentina","Brasil","Chile","Uruguay","Paraguay","Bolivia","Perú","Ecuador","Colombia","Venezuela",
    "México","Canadá","Estados Unidos","España","Portugal","Francia","Italia","Alemania","Reino Unido","Japón",
    "China","Corea del Sur","India","Australia","Egipto","Marruecos","Sudáfrica","Rusia","Noruega","Suecia"
  ],
  animales: [
    "Perro","Gato","León","Tigre","Elefante","Jirafa","Cebra","Mono","Oso","Lobo",
    "Zorro","Caballo","Vaca","Cerdo","Gallina","Águila","Pingüino","Delfín","Ballena","Tiburón",
    "Cocodrilo","Serpiente","Tortuga","Rana","Mariposa","Abeja","Araña","Pulpo","Canguro","Panda"
  ],
  objetos: [
    "Mesa","Silla","Cama","Puerta","Ventana","Lámpara","Teléfono","Computadora","Televisor","Reloj",
    "Mochila","Paraguas","Llave","Martillo","Destornillador","Tijera","Cuchillo","Vaso","Botella","Libro",
    "Lápiz","Goma","Cámara","Bicicleta","Guitarra","Pelota","Auriculares","Espejo","Cepillo","Valija"
  ],
  comida: [
    "Pizza","Hamburguesa","Empanada","Milanesa","Asado","Pasta","Sushi","Tacos","Ensalada","Sandwich",
    "Helado","Chocolate","Panqueques","Torta","Galletitas","Papas fritas","Arroz","Sopa","Queso","Pan",
    "Manzana","Banana","Frutilla","Naranja","Sandía","Tomate","Zanahoria","Maíz","Pollo","Pescado"
  ],
  deportes: [
    "Fútbol","Básquet","Tenis","Vóley","Rugby","Natación","Boxeo","Ciclismo","Atletismo","Golf",
    "Hockey","Béisbol","Handball","Esgrima","Judo","Karate","Surf","Esquí","Automovilismo","Gimnasia"
  ],
  profesiones: [
    "Médico","Bombero","Policía","Maestro","Ingeniero","Abogado","Arquitecto","Cocinero","Panadero","Mecánico",
    "Piloto","Periodista","Fotógrafo","Músico","Actor","Veterinario","Dentista","Carpintero","Electricista","Programador"
  ],
  lugares: [
    "Escuela","Hospital","Aeropuerto","Estadio","Playa","Montaña","Bosque","Desierto","Museo","Cine",
    "Restaurante","Supermercado","Biblioteca","Parque","Zoológico","Hotel","Castillo","Iglesia","Estación","Puerto"
  ],
  videojuegos: [
    "Minecraft","Fortnite","Roblox","Terraria","ARK","GTA","FIFA","Pokémon","Mario","Zelda",
    "Among Us","Rocket League","Valorant","Overwatch","Fall Guys","Counter-Strike","The Sims","Doom","Halo","Sonic"
  ]
};

function getCategoryWords(category, customWords = []) {
  if (category === "personalizada") {
    return [...new Set(customWords.map(w => String(w).trim()).filter(Boolean))].slice(0, 5000);
  }
  return BUILTIN_CATEGORIES[category] || [];
}

function makeCode() {
  let code;
  do code = Math.random().toString(36).substring(2, 7).toUpperCase();
  while (rooms.has(code));
  return code;
}

function publicPlayers(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    ready: !!room.ready[p.id]
  }));
}

function emitRoom(code) {
  const room = rooms.get(code);
  if (!room) return;

  io.to(code).emit("room-update", {
    code,
    players: publicPlayers(room),
    hostId: room.hostId,
    started: room.started,
    phase: room.phase,
    category: room.category,
    categoryName: room.category === "personalizada" ? "Personalizada" : room.category,
    currentPlayerId: room.currentPlayerId,
    turnNumber: room.turnNumber,
    totalTurns: room.turnOrder.length,
    timeLeft: room.timeLeft,
    readyCount: activePlayers(room).filter(p => room.ready[p.id]).length,
    aliveCount: activePlayers(room).length
  });
}

function activePlayers(room) {
  return room.players.filter(p => p.alive);
}

function resetReady(room) {
  room.ready = {};
  activePlayers(room).forEach(p => {
    room.ready[p.id] = false;
  });
}

function sendPrivateRoles(code) {
  const room = rooms.get(code);
  if (!room) return;

  room.players.forEach(player => {
    if (!player.alive) return;

    io.to(player.id).emit("private-role", {
      impostor: player.id === room.impostorId,
      word: player.id === room.impostorId ? null : room.word
    });
  });
}

function startReadyPhase(code) {
  const room = rooms.get(code);
  if (!room) return;

  clearInterval(room.timer);
  room.phase = "ready";
  room.currentPlayerId = null;
  room.timeLeft = 0;
  resetReady(room);

  sendPrivateRoles(code);
  io.to(code).emit("ready-phase", {
    players: publicPlayers(room),
    total: activePlayers(room).length
  });
  emitRoom(code);
}

function beginDescriptionRound(code) {
  const room = rooms.get(code);
  if (!room) return;

  room.phase = "describing";
  room.turnOrder = activePlayers(room).map(p => p.id);
  room.turnNumber = 0;
  room.currentPlayerId = room.turnOrder[0] || null;
  startTurnTimer(code);
  emitRoom(code);
}

function startTurnTimer(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== "describing") return;

  room.timeLeft = 10;
  clearInterval(room.timer);

  io.to(code).emit("turn-start", {
    playerId: room.currentPlayerId,
    seconds: 10,
    turnNumber: room.turnNumber + 1,
    totalTurns: room.turnOrder.length
  });

  room.timer = setInterval(() => {
    const r = rooms.get(code);
    if (!r) return clearInterval(room.timer);

    r.timeLeft--;
    io.to(code).emit("timer", r.timeLeft);

    if (r.timeLeft <= 0) finishTurn(code);
  }, 1000);
}

function finishTurn(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== "describing") return;

  clearInterval(room.timer);
  room.turnNumber++;

  if (room.turnNumber >= room.turnOrder.length) {
    startVoting(code);
    return;
  }

  room.currentPlayerId = room.turnOrder[room.turnNumber];
  startTurnTimer(code);
  emitRoom(code);
}

function startVoting(code) {
  const room = rooms.get(code);
  if (!room) return;

  clearInterval(room.timer);
  room.phase = "voting";
  room.currentPlayerId = null;
  room.timeLeft = 0;
  room.votes = {};

  io.to(code).emit("voting-start", {
    players: activePlayers(room).map(p => ({ id: p.id, name: p.name }))
  });

  emitRoom(code);
}

function finishVoting(code) {
  const room = rooms.get(code);
  if (!room || room.phase !== "voting") return;

  const alive = activePlayers(room);
  const counts = {};
  alive.forEach(p => counts[p.id] = 0);

  for (const voterId of Object.keys(room.votes)) {
    const targetId = room.votes[voterId];
    if (counts[targetId] !== undefined) counts[targetId]++;
  }

  const max = Math.max(...Object.values(counts));
  const candidates = alive.filter(p => counts[p.id] === max);
  const eliminated = candidates[Math.floor(Math.random() * candidates.length)];

  const voteDetails = Object.entries(room.votes).map(([voterId, targetId]) => ({
    voterId,
    voterName: room.players.find(p => p.id === voterId)?.name || "Jugador",
    targetId,
    targetName: room.players.find(p => p.id === targetId)?.name || "Jugador"
  }));

  const foundImpostor = eliminated.id === room.impostorId;
  eliminated.alive = false;

  io.to(code).emit("vote-result", {
    eliminatedId: eliminated.id,
    eliminatedName: eliminated.name,
    foundImpostor,
    voteCounts: counts,
    voteDetails
  });

  if (foundImpostor) {
    room.phase = "finished";
    room.currentPlayerId = null;
    emitRoom(code);
    return;
  }

  if (activePlayers(room).length <= 2) {
    room.phase = "finished";
    io.to(code).emit("game-over", {
      message: "El impostor sobrevivió. ¡Ganó el impostor!",
      impostorId: room.impostorId,
      impostorName: room.players.find(p => p.id === room.impostorId)?.name
    });
    emitRoom(code);
    return;
  }

  // Misma palabra e impostor. Nueva ronda empieza en "LISTOS",
  // y el cronómetro NO comienza hasta que todos los jugadores vivos estén listos.
  setTimeout(() => startReadyPhase(code), 2500);
}

function returnToLobby(code) {
  const room = rooms.get(code);
  if (!room) return;

  clearInterval(room.timer);
  room.started = false;
  room.phase = "lobby";
  room.word = null;
  room.impostorId = null;
  room.turnOrder = [];
  room.turnNumber = 0;
  room.currentPlayerId = null;
  room.timeLeft = 0;
  room.votes = {};
  room.ready = {};
  room.players.forEach(p => p.alive = true);

  io.to(code).emit("returned-to-lobby");
  emitRoom(code);
}

function removePlayerFromRoom(socket, notifyClient = false) {
  const code = socket.data.room;
  const room = rooms.get(code);
  if (!room) return;

  clearInterval(room.timer);
  const leavingPlayer = room.players.find(p => p.id === socket.id);
  room.players = room.players.filter(p => p.id !== socket.id);
  delete room.ready[socket.id];
  room.turnOrder = room.turnOrder.filter(id => id !== socket.id);
  delete room.votes[socket.id];

  socket.leave(code);
  socket.data.room = null;

  if (!room.players.length) {
    rooms.delete(code);
    if (notifyClient) socket.emit("left-room");
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
  }

  if (room.started && leavingPlayer?.id === room.impostorId) {
    room.phase = "finished";
    room.started = false;
    room.currentPlayerId = null;
    io.to(code).emit("game-over", {
      message: "El impostor abandonó la partida. ¡Ganaron los demás jugadores!"
    });
    emitRoom(code);
  } else if (room.started && activePlayers(room).length < 3 && room.phase !== "finished") {
    room.phase = "finished";
    room.currentPlayerId = null;
    io.to(code).emit("game-over", {
      message: "No hay suficientes jugadores para continuar."
    });
    emitRoom(code);
  } else if (room.started && room.phase !== "finished") {
    // Reinicia la ronda de preparación para evitar turnos/votos apuntando al jugador que salió.
    startReadyPhase(code);
  } else {
    emitRoom(code);
  }

  if (notifyClient) socket.emit("left-room");
}

io.on("connection", socket => {
  socket.on("create-room", ({ name, category, customWords }) => {
    const selectedCategory = String(category || "animales");
    const selectedCustomWords = Array.isArray(customWords)
      ? [...new Set(customWords.map(w => String(w).trim()).filter(Boolean))].slice(0, 5000)
      : [];

    if (!BUILTIN_CATEGORIES[selectedCategory] && selectedCategory !== "personalizada") {
      return socket.emit("error-message", "La categoría seleccionada no es válida.");
    }
    if (selectedCategory === "personalizada" && selectedCustomWords.length < 3) {
      return socket.emit("error-message", "La categoría personalizada necesita al menos 3 palabras.");
    }

    const code = makeCode();

    const room = {
      hostId: socket.id,
      players: [{
        id: socket.id,
        name: String(name || "Jugador").slice(0, 20),
        alive: true
      }],
      started: false,
      phase: "lobby",
      category: selectedCategory,
      customWords: selectedCustomWords,
      word: null,
      impostorId: null,
      turnOrder: [],
      turnNumber: 0,
      currentPlayerId: null,
      timeLeft: 0,
      votes: {},
      ready: {},
      timer: null
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.room = code;
    socket.emit("room-created", { code });
    emitRoom(code);
  });

  socket.on("join-room", ({ code, name }) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) return socket.emit("error-message", "La sala no existe.");
    if (room.started) return socket.emit("error-message", "La partida ya comenzó.");
    if (room.players.length >= 20) return socket.emit("error-message", "La sala está llena.");

    room.players.push({
      id: socket.id,
      name: String(name || "Jugador").slice(0, 20),
      alive: true
    });

    socket.join(code);
    socket.data.room = code;
    socket.emit("room-joined", { code });
    emitRoom(code);
  });

  socket.on("start-game", () => {
    const code = socket.data.room;
    const room = rooms.get(code);

    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 3) {
      return socket.emit("error-message", "Se necesitan al menos 3 jugadores.");
    }

    const words = getCategoryWords(room.category, room.customWords);
    if (!words.length) {
      return socket.emit("error-message", "No hay palabras disponibles en esta categoría.");
    }

    room.started = true;
    room.word = words[Math.floor(Math.random() * words.length)];
    room.impostorId = room.players[Math.floor(Math.random() * room.players.length)].id;
    room.players.forEach(p => p.alive = true);

    startReadyPhase(code);
  });

  socket.on("player-ready", () => {
    const code = socket.data.room;
    const room = rooms.get(code);

    if (!room || room.phase !== "ready") return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    room.ready[socket.id] = true;

    io.to(code).emit("ready-update", {
      players: publicPlayers(room),
      readyCount: activePlayers(room).filter(p => room.ready[p.id]).length,
      total: activePlayers(room).length
    });

    emitRoom(code);

    const allReady = activePlayers(room).every(p => room.ready[p.id]);
    if (allReady) {
      io.to(code).emit("all-ready");
      setTimeout(() => beginDescriptionRound(code), 800);
    }
  });

  socket.on("vote", targetId => {
    const code = socket.data.room;
    const room = rooms.get(code);

    if (!room || room.phase !== "voting") return;

    const voter = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.id === targetId);

    if (!voter?.alive || !target?.alive || socket.id === targetId) return;

    room.votes[socket.id] = targetId;

    io.to(code).emit("vote-update", {
      votes: Object.entries(room.votes).map(([voterId, targetId]) => ({
        voterId,
        voterName: room.players.find(p => p.id === voterId)?.name || "Jugador",
        targetId,
        targetName: room.players.find(p => p.id === targetId)?.name || "Jugador"
      })),
      total: activePlayers(room).length
    });

    if (Object.keys(room.votes).length >= activePlayers(room).length) {
      finishVoting(code);
    }
  });

  socket.on("reset-game", () => {
    const code = socket.data.room;
    const room = rooms.get(code);

    if (!room || room.hostId !== socket.id) return;
    returnToLobby(code);
  });

  socket.on("return-to-lobby", () => {
    const code = socket.data.room;
    if (!rooms.has(code)) return;

    // Todos pueden volver a la sala cuando termina la partida.
    returnToLobby(code);
  });

  socket.on("leave-room", () => {
    removePlayerFromRoom(socket, true);
  });

  socket.on("get-words", () => socket.emit("words-update", getWords()));

  socket.on("save-words", words => {
    if (!Array.isArray(words)) return;

    const clean = [...new Set(
      words.map(w => String(w).trim()).filter(Boolean)
    )].slice(0, 5000);

    saveWords(clean);
    socket.emit("words-update", clean);
  });

  socket.on("disconnect", () => {
    removePlayerFromRoom(socket, false);
  });
});

app.use(express.static(path.join(__dirname, "public")));

server.listen(PORT, () => {
  console.log(`Impostor funcionando en http://localhost:${PORT}`);
});