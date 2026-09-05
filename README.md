# Impostor

Juego web multijugador de "Impostor" con salas en tiempo real usando Node.js, Express y Socket.IO.

## Funciones

- Salas con código para hasta 20 jugadores.
- Categorías integradas y categoría personalizada.
- Roles privados: un impostor y una palabra para el resto.
- Fase de preparación con botón **LISTO**.
- Turnos de descripción de 10 segundos.
- Votación y eliminación por ronda.
- Desempates aleatorios.
- Modo claro / oscuro.
- Posibilidad de volver al lobby y comenzar otra partida.

## Requisitos

- Node.js 18+ recomendado.
- npm.

## Ejecutar en local

```bash
npm install
npm start
```

Luego abrí:

http://localhost:3000

## GitHub

`node_modules` no se incluye en el repositorio. Las dependencias se restauran con `npm install` usando `package.json` y `package-lock.json`.

## Estructura

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── style.css
├── package.json
├── package-lock.json
├── server.js
└── words.json
```
