# 🎬 Conversor de animacion a Video 

> Convierte animaciones HTML/CSS/JS en archivos de video descargables
> version ejeutable en windows en progreso...
> documentacion en progreso...

---

## ¿Qué hace esta herramienta?

Permite capturar animaciones web (HTML + CSS + JS) y exportarlas como video.
---



### 1. Iniciar el servidor

```bash
sudo apt-get install -y ffmpeg libnspr4 libnss3
node node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js browsers install chrome
node server.js

```

### 2. Cargar tu proyecto

Copia la carpeta con tus archivos (`index.html`, `.js`, `.css`) dentro de la carpeta `proyectos/`.

```
proyectos/
└── mi-animacion/
    ├── index.html
    ├── style.css
    └── sketch.js
```

### 3. Abrir en el navegador

```
http://localhost:3000
```

### 4. Ajustar parámetros

Desde la interfaz puedes configurar:

- Resolución del video
- Duración / número de frames
- FPS
- Formato de salida

---

## 📥 Obtener los videos

Los videos renderizados están disponibles de dos formas:

- **Descarga directa** desde la interfaz web
- **Carpeta local** en `renders/` dentro del proyecto

---

## 📁 Estructura del proyecto

```
.
├── server.js          # Servidor principal
├── proyectos/         # Aquí van tus animaciones
│   └── mi-animacion/
│       ├── index.html
│       ├── style.css
│       └── main.js
└── renders/           # Videos exportados
```

---

## 🛠️ Requisitos

- [Node.js](https://nodejs.org/) v16 o superior
- FFmpeg

---

## 📄 Licencia

MIT
