# 🃏 HDP Online

> Juego de cartas multijugador en tiempo real estilo Cards Against Humanity (en español y sin filtros).

---

## 🎮 ¿Qué es?

HDP Online permite que varios jugadores se conecten desde sus celulares o computadoras y jueguen juntos en tiempo real.  
Cada ronda hay un **juez** que elige la respuesta más graciosa.  
El primero en llegar a **8 puntos** gana la partida.

---

## 🚀 Instalación local

### 1. Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/hdp-online.git
cd hdp-online
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Ejecutar el servidor

```bash
node server.js
```

Abrí el navegador en: [http://localhost:3000](http://localhost:3000)

---

## 📁 Estructura del proyecto

```
hdp-online/
├── server.js          ← Servidor Node.js + Socket.IO
├── package.json
├── README.md
├── /public
│   ├── index.html     ← Interfaz del juego
│   ├── style.css      ← Estilos
│   └── game.js        ← Lógica del cliente
└── /data
    ├── blackCards.json ← Cartas negras (preguntas)
    └── whiteCards.json ← Cartas blancas (respuestas)
```

---

## ✏️ Cómo editar las cartas

### Cartas negras (`/data/blackCards.json`)

Cada carta es un objeto con `text`. Usá `____` para indicar espacios en blanco:

```json
[
  { "text": "Mi superpoder secreto es ____." },
  { "text": "Mi cita perfecta incluye ____ y ____." }
]
```

- **1 `____`** → el jugador elige 1 carta blanca  
- **2 `____`** → el jugador elige 2 cartas blancas  

### Cartas blancas (`/data/whiteCards.json`)

Son un array de strings:

```json
[
  "un pato gigante",
  "mi vecino raro",
  "la inflación argentina"
]
```

Podés agregar, quitar o modificar libremente. No necesitás tocar el código.

---

## 📤 Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/hdp-online.git
git push -u origin main
```

---

## ☁️ Deploy en Render

1. Creá una cuenta en [https://render.com](https://render.com)
2. Hacé clic en **New → Web Service**
3. Conectá tu repositorio de GitHub
4. Configurá el servicio:
   - **Name:** `hdp-online`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Hacé clic en **Create Web Service**
6. Esperá el deploy (aprox. 1-2 minutos)
7. Tu juego estará disponible en `https://hdp-online.onrender.com` (o similar)

> ⚠️ El plan gratuito de Render puede tardar ~30 segundos en "despertar" si el servicio estuvo inactivo.

---

## 🎯 Reglas del juego

1. El host crea una sala y comparte el código de 4 dígitos
2. Los demás jugadores ingresan el código para unirse (máx. 8 jugadores)
3. El host presiona **Comenzar partida**
4. Cada ronda:
   - Se revela una carta negra con espacios en blanco
   - Un jugador es el **juez**
   - Los demás eligen carta(s) blanca(s) de su mano
   - El juez elige la respuesta más graciosa
   - El ganador recibe 1 punto
5. El primero en llegar a **8 puntos** gana 🏆

---

## 🛠️ Tecnologías

- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** HTML + CSS + JavaScript puro

