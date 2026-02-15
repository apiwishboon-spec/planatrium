# 🌌 Cosmic Journey: Cinema-Grade Planetarium

A high-fidelity, shader-driven 3D planetarium experience built with Three.js. This project is specifically optimized for 180° hemispherical dome projection, featuring "IMAX Film Grade" visuals and cinematic camera direction.

## ✨ Cinematic Features

- **Movie-Grade Post-Processing**: Includes barrel distortion, anamorphic lens flares, chromatic aberration, and high-frequency film grain for a 70mm film aesthetic.
- **Procedural Solar Engine**: A custom roiling surface shader for the Sun, featuring volumetric light rays and diffractive lens spikes.
- **Atmospheric Planetary Physics**: Planets are rendered using a custom Fresnel-Atmosphere shader with real-time procedural surface detailing.
- **Deep-Field Star Simulation**: Over 60,000+ stars across 4 distinct depth layers, creating an immense sense of space and parallax.
- **Kinetic Camera Direction**: Handheld-style 3D camera jitter and non-linear spline movement for an organic, cinematic feel.
- **Volumetric Nebulae**: Noise-driven smoky nebulae layers that drift and swirl as the observer moves through space.

## 🚀 Quick Start

### Recommended (Modern Web Workflow)
1. Open your terminal in this folder.
2. Run `npm install`
3. Run `npm run dev`
4. Open the provided URL.

### Simple (Python Server)
1. Run `python3 -m http.server 8000`
2. Visit `http://localhost:8000` in your browser.

<<<<<<< HEAD
## 🛠 Project Structure
- `index.html`: Main UI and Full-Dome constraint.
- `main.js`: Three.js engine, starry scenes, and timeline.
- `styles.css`: Visual styling and animations.
=======
## 🛠 Technical Stack
- **Engine**: Three.js (WebGL 2.0)
- **Shaders**: GLSL (Custom Vertex & Fragment Shaders)
- **Post-Processing**: EffectComposer (UnrealBloom, ShaderPass)
- **UI/Layout**: Modern CSS3 (Glassmorphism + Backdrop Filter)

## 🎥 Projection Note
This application is designed with a **180° Fisheye Constraint**. The rendering is oriented "Upward" relative to the horizon, making it a drop-in solution for digital dome planetariums.

---
*Created for the Sirindhorn Planetarium Experience.*
>>>>>>> 56fc17a (Total Movie-Grade Overhaul: Procedural shaders, volumetric sun, cinematic camera jitter, and IMAX post-processing)
