const socket = io();

const $ = id => document.getElementById(id);
const home = $("home");
const room = $("room");
const readyScreen = $("readyScreen");
const description = $("description");
const role = $("role");
const voting = $("voting");
const result = $("result");
const message = $("message");

let currentPlayers = [];
let currentWord = "";
let myReady = false;
let myAlive = true;
let selectedCategory = "animales";
let darkMode = localStorage.getItem("impostor-dark-mode") === "true";

const CATEGORY_NAMES = {
  paises: "🌎 Países",
  animales: "🐾 Animales",
  objetos: "📦 Objetos",
  comida: "🍕 Comida",
  deportes: "⚽ Deportes",
  profesiones: "👷 Profesiones",
  lugares: "📍 Lugares",
  videojuegos: "🎮 Videojuegos",
  personalizada: "✏️ Personalizada"
};

function applyTheme() {
  document.body.classList.toggle("dark-mode", darkMode);
  $("themeToggle").textContent = darkMode ? "☀️ MODO DÍA" : "🌙 MODO NOCHE";
}

applyTheme();

$("themeToggle").onclick = () => {
  darkMode = !darkMode;
  localStorage.setItem("impostor-dark-mode", String(darkMode));
  applyTheme();
};

function showMessage(text) {
  message.textContent = text;
  setTimeout(() => {
    if (message.textContent === text) message.textContent = "";
  }, 3500);
}

function playerName() {
  return $("name").value.trim() || "Jugador";
}

function hideAllGameScreens() {
  room.classList.add("hidden");
  readyScreen.classList.add("hidden");
  description.classList.add("hidden");
  role.classList.add("hidden");
  voting.classList.add("hidden");
  result.classList.add("hidden");
}

document.querySelectorAll(".category-option").forEach(button => {
  button.onclick = () => {
    selectedCategory = button.dataset.category;

    document.querySelectorAll(".category-option").forEach(b =>
      b.classList.toggle("selected", b === button)
    );

    $("customCategoryBox").classList.toggle(
      "hidden",
      selectedCategory !== "personalizada"
    );
  };
});

$("customWords").oninput = () => {
  const count = $("customWords").value
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean).length;
  $("customWordCount").textContent = `${count} ${count === 1 ? "palabra" : "palabras"}`;
};

$("create").onclick = () => {
  const customWords = selectedCategory === "personalizada"
    ? $("customWords").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    : [];

  socket.emit("create-room", {
    name: playerName(),
    category: selectedCategory,
    customWords
  });
};

$("join").onclick = () => {
  socket.emit("join-room", {
    code: $("code").value,
    name: playerName()
  });
};

$("start").onclick = () => socket.emit("start-game");
$("reset").onclick = () => socket.emit("reset-game");
$("returnLobby").onclick = () => socket.emit("return-to-lobby");

// Botones para abandonar la sala y volver al inicio.
// Se conectan explícitamente porque son botones dinámicos/compartidos.
function leaveRoom() {
  socket.emit("leave-room");
}

$("leaveRoom").onclick = leaveRoom;
document.querySelectorAll(".game-leave").forEach(button => {
  button.addEventListener("click", leaveRoom);
});

$("readyButton").onclick = () => {
  if (myReady || !myAlive) return;

  myReady = true;
  $("readyButton").disabled = true;
  $("readyButton").classList.add("done");
  $("readyButton").textContent = "✓ LISTO";
  socket.emit("player-ready");
};

socket.on("left-room", () => {
  hideAllGameScreens();
  home.classList.remove("hidden");
  $("code").value = "";
  $("roomCode").textContent = "";
  $("roomCategory").textContent = "";
  currentPlayers = [];
  myReady = false;
  myAlive = true;
  showMessage("");
});

socket.on("room-created", ({ code }) => {
  $("roomCode").textContent = code;
  home.classList.add("hidden");
  room.classList.remove("hidden");
});

socket.on("room-joined", ({ code }) => {
  $("roomCode").textContent = code;
  home.classList.add("hidden");
  room.classList.remove("hidden");
});

socket.on("room-update", data => {
  $("roomCode").textContent = data.code;
  currentPlayers = data.players;
  $("roomCategory").textContent =
    CATEGORY_NAMES[data.category] || "Categoría";

  $("players").innerHTML = data.players.map(p =>
    `<div class="player ${p.alive ? "" : "dead"}">
      ${p.alive ? "👤" : "☠️"} ${escapeHtml(p.name)}
    </div>`
  ).join("");

  $("start").classList.toggle(
    "hidden",
    socket.id !== data.hostId || data.started
  );

  $("reset").classList.toggle(
    "hidden",
    socket.id !== data.hostId || !data.started
  );

  myAlive = !!data.players.find(p => p.id === socket.id)?.alive;

  if (data.phase === "lobby") {
    $("phaseText").textContent = "Esperando jugadores...";
  } else if (data.phase === "ready") {
    $("phaseText").textContent =
      `Preparados: ${data.readyCount}/${data.aliveCount}`;
    renderReadyPlayers(data.players);
  } else if (data.phase === "describing") {
    $("phaseText").textContent = "Turno de descripción";
  } else if (data.phase === "voting") {
    $("phaseText").textContent = "¡A votar!";
  } else if (data.phase === "finished") {
    $("phaseText").textContent = "Partida terminada.";
  }
});

socket.on("private-role", data => {
  currentWord = data.impostor ? "SOS EL IMPOSTOR" : data.word;

  $("wordText").textContent = currentWord;
  $("descriptionWord").textContent = currentWord;

  myReady = false;
  $("readyButton").disabled = false;
  $("readyButton").classList.remove("done");
  $("readyButton").textContent = "✓ LISTO";
});

socket.on("ready-phase", data => {
  myReady = false;
  $("readyButton").disabled = false;
  $("readyButton").classList.remove("done");
  $("readyButton").textContent = "✓ LISTO";

  $("readyStatus").textContent =
    `Esperando jugadores: 0/${data.total}`;

  renderReadyPlayers(data.players);

  hideAllGameScreens();
  readyScreen.classList.remove("hidden");
});

socket.on("ready-update", data => {
  const mine = data.players.find(p => p.id === socket.id);
  myReady = !!mine?.ready;

  if (myReady) {
    $("readyButton").disabled = true;
    $("readyButton").classList.add("done");
    $("readyButton").textContent = "✓ YA ESTÁS LISTO";
  }

  $("readyStatus").textContent =
    `Esperando jugadores: ${data.readyCount}/${data.total}`;

  renderReadyPlayers(data.players);
});

socket.on("all-ready", () => {
  $("readyStatus").textContent = "✓ TODOS ESTÁN LISTOS";
});

function renderReadyPlayers(players) {
  $("readyPlayers").innerHTML = players.map(p => `
    <div class="ready-player ${p.ready ? "ready" : ""} ${p.alive ? "" : "dead"}">
      ${p.ready ? "✓" : "○"} ${escapeHtml(p.name)}
    </div>
  `).join("");
}

socket.on("turn-start", data => {
  $("descriptionTimer").textContent = data.seconds;

  const name =
    currentPlayers.find(p => p.id === data.playerId)?.name || "Jugador";

  $("descriptionTurnInfo").textContent =
    data.playerId === socket.id
      ? `🎙️ TU TURNO · ${data.turnNumber}/${data.totalTurns}`
      : `🎙️ TURNO DE ${name} · ${data.turnNumber}/${data.totalTurns}`;

  hideAllGameScreens();
  description.classList.remove("hidden");
});

socket.on("timer", seconds => {
  $("descriptionTimer").textContent = Math.max(0, seconds);
});

socket.on("voting-start", data => {
  hideAllGameScreens();
  voting.classList.remove("hidden");

  renderVoteButtons(data.players);
  $("voteList").innerHTML = "";
});

function renderVoteButtons(players) {
  $("voteButtons").innerHTML = players
    .filter(p => p.id !== socket.id)
    .map(p =>
      `<button onclick="castVote('${p.id}')">
        🎯 ${escapeHtml(p.name)}
      </button>`
    ).join("");
}

window.castVote = id => {
  socket.emit("vote", id);
  document.querySelectorAll("#voteButtons button")
    .forEach(button => button.disabled = true);
};

socket.on("vote-update", data => {
  $("voteList").innerHTML = data.votes.map(v =>
    `<div class="vote-item">
      👤 ${escapeHtml(v.voterName)} → 🎯 ${escapeHtml(v.targetName)}
    </div>`
  ).join("");
});

socket.on("vote-result", data => {
  hideAllGameScreens();
  result.classList.remove("hidden");

  $("resultTitle").textContent =
    data.foundImpostor
      ? "🎉 ¡IMPOSTOR ENCONTRADO!"
      : "❌ NO ERA EL IMPOSTOR";

  $("resultBox").textContent =
    data.foundImpostor
      ? `${data.eliminatedName} era el impostor.`
      : `Se elimina a ${data.eliminatedName}. La misma palabra continúa.`;

  $("returnLobby").classList.toggle("hidden", !data.foundImpostor);

  $("resultVotes").innerHTML = data.voteDetails.map(v =>
    `<div class="vote-item">
      👤 ${escapeHtml(v.voterName)} → 🎯 ${escapeHtml(v.targetName)}
    </div>`
  ).join("");

  if (!data.foundImpostor) {
    setTimeout(() => {
      result.classList.add("hidden");
      readyScreen.classList.remove("hidden");
    }, 2500);
  }
});

socket.on("game-over", data => {
  hideAllGameScreens();
  result.classList.remove("hidden");

  $("resultTitle").textContent = "🏆 FIN DE LA PARTIDA";
  $("resultBox").textContent =
    data.message +
    (data.impostorName ? ` El impostor era ${data.impostorName}.` : "");
  $("returnLobby").classList.remove("hidden");
});

socket.on("returned-to-lobby", () => {
  hideAllGameScreens();
  $("returnLobby").classList.add("hidden");
  room.classList.remove("hidden");
  $("phaseText").textContent = "Esperando jugadores...";
});


socket.on("error-message", showMessage);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}