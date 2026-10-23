# 🐾 RoboChibi 3D - CyberPup Virtual World con IA (FreeLLMsAPI)

Un entorno virtual 3D inmersivo, interactivo y adorable donde habita una manada de **Perritos Robots Chibi** con personalidades únicas, gráficos texturizados de alta definición, cámara diagonal isométrica, parque de atracciones interactivo con físicas, cambio de robot en tiempo real, memoria persistente en disco y conectividad con tu **FreeLLMsAPI**.

---

## 🌟 Novedades y Características Principales

### 1. 🎮 Cambio y Posesión de Robots en Tiempo Real (Tab o Clic)
Ahora puedes controlar a **cualquiera de los 5 perritos robots** en cualquier momento con un solo clic o presionando la tecla **Tab**:
* **🐾 Sparky (El Explorador Curioso):** Equilibrado, noble y con gran afinidad por investigar el prado y el lago.
* **⚡ Bolt (El Relámpago Veloz):** 35% más rápido, propulsores al máximo y fanático de perseguir pelotas.
* **🔍 Pixel (El Hacker del Lago):** Analítico y metódico, investiga la orilla del lago y calcula trayectorias.
* **💖 Luna (La Soñadora Celestial):** Dulce y afectuosa, adora las flores y descansar en la estación de recarga.
* **🤸 Rusty (El Acróbata Ágil):** Gimnasta intrépido, adora el trampolín, las volteretas triples y el carrusel.
> *Cuando controlas a uno, los otros 4 robots se mueven autónomamente con sus propias personalidades, juegan entre ellos y te saludan al acercarte.*

### 2. 🎪 Parque de Juegos Ultra-Interactivo
* **🤸 Trampolín Elástico de Salto:** Sube o salta sobre el trampolín para salir disparado por los aires haciendo volteretas acrobáticas con sonido de resorte.
* **🎠 Carrusel Giratorio:** Plataforma giratoria continua con barras de sujeción para subirse a dar vueltas.
* **⚽ Portería de Fútbol con Contador de Goles:** ¡Patea la pelota de fútbol dentro de la red! Se activará un espectáculo de fuegos artificiales, sonará una fanfarria y el marcador del HUD sumará un gol.
* **🪩 Pista de Baile Disco:** Pista con baldosas iluminadas de neón y bola de espejos. ¡Haz clic en "Fiesta Disco" para activar el ritmo bailable y ver a los robots danzar al compás!
* **🍪 Dispensador de Galletas Cibernéticas:** Presiona el botón para soltar deliciosas galletas energéticas luminosas en el suelo; los perritos correrán a comérselas y recargarán su energía al 100%.
* **🚤 Barquito de Juguete en el Lago:** Un barquito a motor flotante que se balancea con el oleaje en el Lago de Cristal y responde a los empujones.

### 3. 🎨 Gráficos Mejorados y Texturas Procedurales PBR
* **Textura de Césped Esmeralda:** Briznas y variaciones de verde procedurales con iluminación realista.
* **Textura Clásica de Pelota de Fútbol:** Paneles cosidos blancos y negros con relieve.
* **Textura de Madera y Corteza:** Vetas realistas en el muelle del lago y los troncos de los árboles.
* **Textura de Ondas en el Lago:** Cáusticas y reflejos cristalinos animados.
* **Textura de Piso Tartán:** Alfombra amortiguadora ajedrezada en el parque de juegos.
* **☀️ Ciclo Horario (Día / Tarde / Noche):**
  * **Día:** Cielo celeste claro, sol brillante y visibilidad nítida.
  * **Tarde:** Atardecer dorado con tonos cálidos y sombras largas.
  * **Noche:** Noche estrellada profunda donde las luces de neón y los visores LED de los robots brillan intensamente.

### 4. 📐 Cámaras Cinematográficas (Diagonal Isométrica por Defecto)
1. **📐 Diagonal Isométrica (45°):** Perspectiva RPG elevada, acogedora y suave que sigue al robot activo.
2. **🎥 Seguir (3ra Persona):** Cámara de acción dinámica detrás del robot.
3. **🌐 Órbita Libre:** Inspección 360° con giro y zoom manual.
4. **👁️ Ojos:** Primera persona inmersiva a través de los ojos del perrito.
5. **🚁 Drone:** Modo cinemático que orbita lentamente alrededor de la escena.

### 5. 🧠 Inteligencia Artificial con FreeLLMsAPI y Construcción de Personajes
* Cada robot tiene una **voz con tono propio** y un **estilo de pensamiento personalizado**.
* El prompt de FreeLLMsAPI adopta automáticamente la personalidad del robot que estás controlando.
* Formato JSON comprimido de **menos de 140 tokens por turno** para latencia mínima y cero gasto innecesario de cuota.
* Memoria persistente sincronizada en disco en `E:\RoboChibiLand\data\memory.json`.

---

## 🎮 Controles de Teclado y Ratón

| Tecla / Acción | Función |
| :--- | :--- |
| **Tab** o **Clic en Tarjeta** | **Cambiar y poseer cualquiera de los 5 robots** |
| **Clic en un Robot del Mundo** | Tomar control directo de ese robot |
| **W, A, S, D** o **Flechas** | Mover al robot activo por el mapa |
| **Shift** + Mover | Correr a toda velocidad con propulsores |
| **Espacio** | Saltar |
| **P** | Acariciar al robot activo (corazones y ronroneo) |
| **B** | Ladrar con el tono de voz único del robot |
| **F** | Hacer una voltereta acrobática (Backflip) |
| **1 al 6** | Cambiar expresión emocional manualmente |
| **Arrastrar Ratón** | Rotar la cámara |
| **Rueda del Ratón** | Zoom in / Zoom out |

---

## 🚀 Cómo Iniciar el Proyecto

### Con un Solo Clic:
Haz doble clic en:
> [`iniciar.bat`](file:///E:/RoboChibiLand/iniciar.bat) (en `E:\RoboChibiLand\iniciar.bat`)

O desde la terminal en `E:\RoboChibiLand`:
```powershell
node server.js
```
El navegador se abrirá automáticamente en `http://localhost:3000`.
