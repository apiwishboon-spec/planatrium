# Sirindhorn Planetarium - Cosmic Journey
## Cinema-Grade Full-Dome Experience

A high-fidelity, shader-driven 3D planetarium experience built with Three.js. This project is specifically optimized for 180° hemispherical dome projection, featuring "IMAX Film Grade" visuals and cinematic camera direction.

### 🏛 Hardware Specifications (Target Host)
- **Projector**: Domedia Pro (Professional Grade)
- **Resolution**: 1920 x 1200 (16:10 Native)
- **Brightness**: 10,000 Lumens
- **Contrast Ratio**: 10,000:1 (High Dynamic Range)
- **Audio System**: 5.1 Discrete Surround Sound array
- **Storage**: Hybrid SSD/HDD Professional Storage

### ✨ Cinematic Features
- **Movie-Grade Post-Processing**: Includes barrel distortion, anamorphic lens flares, chromatic aberration, and high-frequency film grain for a 70mm film aesthetic.
- **Procedural Solar Engine**: A custom roiling surface shader for the Sun, featuring volumetric light rays and diffractive lens spikes.
- **Atmospheric Planetary Physics**: Planets are rendered using a custom Fresnel-Atmosphere shader with real-time procedural surface detailing.
- **Deep-Field Star Simulation**: Over 100,000+ stars across 4 distinct depth layers, creating an immense sense of space and parallax.
- **Kinetic Camera Direction**: Handheld-style 3D camera jitter and non-linear spline movement with "Swoosh" acceleration for an organic feel.
- **Volumetric Nebulae**: Noise-driven smoky nebulae layers that drift and swirl as the observer moves through space.
- **5.1 Spatial Surround**: Multi-channel audio mapping optimized for professional hemispherical sound arrays.

### � Quick Start
#### Recommended (Modern Web Workflow)
1. Open your terminal in this folder.
2. Run `npm install`
3. Run `npm run dev`
4. Open the provided URL.

#### Simple (Python Server)
1. Run `python3 -m http.server 8000`
2. Visit `http://localhost:8000` in your browser.

### 🛠 Project Structure
- `index.html`: Main UI and Full-Dome constraint.
- `main.js`: Three.js engine, starry scenes, and timeline logic.
- `styles.css`: Visual styling, glassmorphism UI, and transitions.
- `welcome.png`: AI-generated high-fidelity landing artwork.
- `music.mp3`: Cinematic surround-soundtrack (2:41 duration).

### 🛠 Technical Stack
- **Engine**: Three.js (WebGL 2.0 / highp precision)
- **Shaders**: GLSL (Custom Vertex & Fragment Shaders)
- **Post-Processing**: EffectComposer (UnrealBloom, ShaderPass)
- **Audio**: Web Audio API (Spatial Positional Audio)

### 🎥 Projection Note
This application is designed with a **180° Fisheye Constraint**. The rendering is oriented "Upward" relative to the horizon, making it a drop-in solution for digital dome planetariums like the Domedia Pro.

---
*Created for the Sirindhorn Planetarium.*
