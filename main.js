import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// --- CONFIGURATION ---
const CONFIG = {
    starCount: 100000, // Even more stars
    nebulaCount: 60,
    cameraDriftSpeed: 0.005,
    rotationSpeed: 0.004,
    swooshFactor: 0.0,
    timeline: [
        { name: 'Emergence', duration: 10 },
        { name: 'The Great Silence', duration: 35 },
        { name: 'Celestial Structures', duration: 30 },
        { name: 'Systems of Light', duration: 40 },
        { name: 'Transcendence', duration: 30 },
        { name: 'Infinite Scale', duration: 10 },
        { name: 'Stardust Memory', duration: 6 }
    ]
};

// --- SHADERS ---
const FisheyeShader = {
    uniforms: {
        'tCube': { value: null },
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform samplerCube tCube;
        uniform vec2 resolution;
        varying vec2 vUv;
        const float PI = 3.14159265359;

        void main() {
            // Precise aspect ratio correction for a perfect circle
            float minRes = min(resolution.x, resolution.y);
            vec2 uv = (vUv - 0.5) * resolution.xy / (minRes * 0.5);
            
            float r = length(uv);
            if (r > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            float theta = atan(uv.y, uv.x);
            float phi = r * PI * 0.5;

            // Corrected mapping: Screen X/Y -> World X/Z with Zenith Up
            vec3 dir = vec3(
                sin(phi) * cos(theta), // Right
                cos(phi),               // Up (Zenith)
                sin(phi) * sin(theta)  // Forward
            );
            
            // Use textureCube for maximum compatibility
            vec4 color = textureCube(tCube, dir);
            
            float edge = smoothstep(1.0, 0.98, r);
            gl_FragColor = vec4(color.rgb * 1.5 * edge, 1.0);
        }
    `
};

const StarShader = {
    uniforms: {
        'time': { value: 0 },
        'opacity': { value: 1.0 }
    },
    vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float offset;
        varying vec3 vColor;
        varying float vOffset;
        varying float vSize;
        void main() {
            vColor = color;
            vOffset = offset;
            vSize = size;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (400.0 / max(-mvPosition.z, 1.0));
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform float opacity;
        varying vec3 vColor;
        varying float vOffset;
        varying float vSize;
        void main() {
            vec2 cxy = gl_PointCoord - 0.5;
            float r = length(cxy);
            if (r > 0.5) discard;
            
            // Core Glow
            float glow = exp(-r * 8.0);
            
            // Twinkle
            float twinkle = 0.8 + 0.3 * sin(time * 2.5 + vOffset);
            
            // Diffraction Spikes for bright stars
            float spikes = 0.0;
            if (vSize > 8.0) {
                float beam1 = smoothstep(0.01, 0.0, abs(cxy.x) * abs(cxy.y) * 100.0);
                float beam2 = smoothstep(0.01, 0.0, abs(cxy.x - cxy.y) * abs(cxy.x + cxy.y) * 100.0);
                spikes = (beam1 + beam2) * 0.4 * glow;
            }
            
            vec3 finalColor = vColor * (glow + spikes) * twinkle * opacity;
            gl_FragColor = vec4(finalColor, glow * opacity);
        }
    `
};

const CinematicShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'time': { value: 0 },
        'amount': { value: 0.004 },
        'chromaticAberration': { value: 0.0015 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float amount;
        uniform float chromaticAberration;
        varying vec2 vUv;

        float random(vec2 p) {
            return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            
            // Subtle Chromatic Aberration
            vec2 rUv = uv + vec2(chromaticAberration, 0.0);
            vec2 gUv = uv;
            vec2 bUv = uv - vec2(chromaticAberration, 0.0);

            vec4 rCol = texture2D(tDiffuse, rUv);
            vec4 gCol = texture2D(tDiffuse, gUv);
            vec4 bCol = texture2D(tDiffuse, bUv);

            vec4 color = vec4(rCol.r, gCol.g, bCol.b, gCol.a);

            // Film Grain
            float grain = (random(uv + time) - 0.5) * amount;
            color.rgb += grain;

            // Aspect-aware Vignette
            float minRes = 1.0; // In UV space
            vec2 vignUv = (vUv - 0.5);
            // We don't have resolution here, so we assume the previous pass fixed the circle.
            // But to be safe, let's keep vignette very soft at the edges.
            float dist = length(vignUv);
            float vignette = smoothstep(0.8, 0.3, dist);
            color.rgb *= vignette;

            // IMAX color grade
            color.rgb = pow(clamp(color.rgb, 0.0, 1.0), vec3(1.1)); 
            color.rgb *= vec3(1.0, 1.01, 1.02);
            
            gl_FragColor = vec4(color.rgb, 1.0);
        }
    `
};

const SolarShader = {
    uniforms: {
        'time': { value: 0 },
        'color': { value: new THREE.Color(0xfff5cc) }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform vec3 color;
        varying vec2 vUv;
        varying vec3 vNormal;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
                               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
        }

        void main() {
            vec3 normal = normalize(vNormal);
            vec2 p = vUv * 8.0;
            float n = noise(p + time * 0.5);
            n += 0.5 * noise(p * 2.0 - time * 0.3);
            
            vec3 fireColor = mix(vec3(1.0, 0.4, 0.0), vec3(1.0, 0.9, 0.2), n);
            float rim = 1.0 - max(dot(vec3(0,0,1), normal), 0.0);
            rim = pow(rim, 3.0);
            
            gl_FragColor = vec4(mix(color, fireColor, n) + rim * 0.5, 1.0);
        }
    `
};

const PlanetShader = {
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPos.xyz;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 color;
        uniform vec3 sunDirection;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;

        // Simple Hash
        float hash(vec3 p) {
            p = fract(p * 0.1031);
            p += dot(p, p.yzx + 33.33);
            return fract((p.x + p.y) * p.z);
        }

        // Noise function for surface detail
        float noise(vec3 x) {
            vec3 p = floor(x);
            vec3 f = fract(x);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hash(p + vec3(0, 0, 0)), hash(p + vec3(1, 0, 0)), f.x),
                           mix(hash(p + vec3(0, 1, 0)), hash(p + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(hash(p + vec3(0, 0, 1)), hash(p + vec3(1, 0, 1)), f.x),
                           mix(hash(p + vec3(0, 1, 1)), hash(p + vec3(1, 1, 1)), f.x), f.y), f.z);
        }

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            
            // Procedural Surface Detail (FBM-like)
            float n = noise(vWorldPosition * 0.1);
            n += 0.5 * noise(vWorldPosition * 0.2);
            n += 0.25 * noise(vWorldPosition * 0.4);
            
            // Diffuse lighting from sun
            float dotNL = max(dot(normal, normalize(sunDirection)), 0.0);
            
            // Shadows with surface grit
            float darkness = smoothstep(-0.2, 0.4, dotNL);
            
            // Atmospheric rim light (Soft Movie Glow)
            float rim = 1.0 - max(dot(viewDir, normal), 0.0);
            rim = pow(rim, 6.0);
            
            vec3 planetColor = color * (n * 0.5 + 0.8);
            vec3 finalColor = planetColor * (darkness * 0.9 + 0.1);
            finalColor += color * rim * 1.2; // Stronger cinematic rim
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
};

const WelcomeShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'opacity': { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            gl_FragColor = vec4(tex.rgb, tex.a * opacity);
        }
    `
};

// --- APP CLASS ---
class Planetarium {
    constructor() {
        this.canvas = document.getElementById('main-canvas');
        this.previewCanvas = document.getElementById('preview-canvas');

        // Initial sizing - use window fallback if client dimensions aren't ready
        const width = this.canvas.clientWidth || window.innerWidth / 2;
        const height = this.canvas.clientHeight || window.innerHeight / 2;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            stencil: false,
            precision: 'highp',
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Preview Monitor Renderer
        this.previewRenderer = new THREE.WebGLRenderer({
            canvas: this.previewCanvas,
            antialias: true
        });
        this.previewRenderer.setPixelRatio(1);
        this.previewRenderer.setSize(width, height); // Mirror initial size
        this.previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

        // Scenes
        this.scene = new THREE.Scene();
        this.uiScene = new THREE.Scene();

        // Cameras
        // 1. Dome Projection Camera (Rig)
        const cubeRes = 4096;
        this.cubeCamera = new THREE.CubeCamera(0.1, 30000, new THREE.WebGLCubeRenderTarget(cubeRes, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
            magFilter: THREE.LinearFilter,
            anisotropy: 16,
            format: THREE.RGBAFormat,
            colorSpace: THREE.SRGBColorSpace
        }));
        this.scene.add(this.cubeCamera);

        // 2. Director Preview Camera (Standard Perspective)
        this.previewCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 40000);
        this.scene.add(this.previewCamera);

        this.finalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Post-processing
        this.setupPostProcessing();

        // State & Timing
        this.startTime = 0;
        this.elapsedTime = 0;
        this.isActive = false;
        this.currentSceneIndex = 0;

        // Visuals Setup
        this.stars = null;
        this.milkyWay = null;
        this.sun = null;
        this.planets = [];
        // Pre-bind animation for performance
        this._animate = this.animate.bind(this);

        // Global expose for dashboard buttons
        window.app = this;

        // Audio System (Optimized for 5.1 Surround Sound)
        const audioContext = THREE.AudioContext.getContext();
        if (audioContext.destination.maxChannelCount >= 6) {
            audioContext.destination.channelCount = 6;
            audioContext.destination.channelCountMode = 'explicit';
            audioContext.destination.channelInterpretation = 'speakers';
            console.log("5.1 Surround Sound hardware detected and enabled.");
        } else {
            console.warn("Hardware does not support 6 channels. Falling back to stereo.");
        }

        this.listener = new THREE.AudioListener();
        this.cubeCamera.add(this.listener);
        this.sound = new THREE.Audio(this.listener);
        this.audioLoader = new THREE.AudioLoader();

        // Load background music
        this.audioLoader.load('music.mp3', (buffer) => {
            this.sound.setBuffer(buffer);
            this.sound.setLoop(true);
            this.sound.setVolume(0.4);
        });

        // Welcome Dome Group
        this.welcomeGroup = new THREE.Group();
        this.scene.add(this.welcomeGroup);

        this.init();
        this.addEventListeners();

        // One-time manual trigger to sync canvas sizes after layout
        window.dispatchEvent(new Event('resize'));

        // Dual Window Sync System
        this.channel = new BroadcastChannel('planetarium_sync');
        this.isProgram = new URLSearchParams(window.location.search).get('mode') === 'program';

        if (this.isProgram) {
            document.documentElement.classList.add('program-mode');
            this.sound.setVolume(0); // Only master plays audio
        }

        this.channel.onmessage = (e) => {
            const data = e.data;
            if (this.isProgram) {
                if (data.type === 'start') this.start(data.startTime);
                if (data.type === 'jump') this.jumpToScene(data.index);
                if (data.type === 'pause') this.togglePause(true);
                if (data.type === 'resume') this.togglePause(false);
            }
        };

        console.log(`Planetarium ${this.isProgram ? 'PROGRAM' : 'DIRECTOR'}: ONLINE`);

        // Start animation loop immediately
        requestAnimationFrame(this._animate);
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        this.fisheyePass = new ShaderPass(FisheyeShader);
        this.fisheyePass.uniforms['tCube'].value = this.cubeCamera.renderTarget.texture;

        // Use clientWidth/Height for the shader resolution logic
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        const pr = this.renderer.getPixelRatio();
        this.fisheyePass.uniforms.resolution.value.set(w * pr, h * pr);
        this.composer.addPass(this.fisheyePass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w, h),
            2.5, 0.5, 0.4
        );
        this.bloomPass.enabled = false;
        this.composer.addPass(this.bloomPass);

        // Pass 4: Cinematic IMAX Grade (Grain + Chromatic Aberration)
        this.cinematicPass = new ShaderPass(CinematicShader);
        this.composer.addPass(this.cinematicPass);

        console.log("Post-processing setup complete.");
    }

    init() {
        // Universal Ambient Light - prevents total blackness in control room
        const ambient = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambient);

        this.createWelcomeDome();
        this.createStarField();
        this.createNebulae();
        this.createMilkyWay();
        this.createSolarSystem();
        this.createMicroParticles();
        this.createShootingStarPool();
    }

    createWelcomeDome() {
        // WelcomScreen is now handled by static HTML/CSS overlay for perfect fidelity
        // No 3D objects needed for the landing page
    }

    createStarField() {
        this.starLayers = [];
        const layerConfigs = [
            { count: CONFIG.starCount * 0.3, size: 25.0, spread: 1500, color: 0xffffff }, // Near & Bright
            { count: CONFIG.starCount * 0.7, size: 12.0, spread: 3500, color: 0xccccff },  // Mid
            { count: CONFIG.starCount * 1.5, size: 6.0, spread: 6000, color: 0xaaaaff },  // Far
            { count: CONFIG.starCount * 3.0, size: 3.5, spread: 12000, color: 0x8888ff }  // Deep Field
        ];

        layerConfigs.forEach(cfg => {
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            const colors = [];
            const sizes = [];
            const offsets = [];

            for (let i = 0; i < cfg.count; i++) {
                const r = cfg.spread * (0.3 + Math.random() * 0.7);
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);

                positions.push(
                    r * Math.sin(phi) * Math.cos(theta),
                    r * Math.sin(phi) * Math.sin(theta),
                    r * Math.cos(phi)
                );

                const intensity = 0.8 + Math.random() * 0.2;
                const col = new THREE.Color(cfg.color).multiplyScalar(intensity);
                colors.push(col.r, col.g, col.b);
                sizes.push(cfg.size * (0.5 + Math.random()));
                offsets.push(Math.random() * 100);
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
            geometry.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 1));

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0 },
                    opacity: { value: 0 }
                },
                vertexShader: StarShader.vertexShader,
                fragmentShader: StarShader.fragmentShader,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const points = new THREE.Points(geometry, material);
            points.userData.initialSize = cfg.size;
            this.scene.add(points);
            this.starLayers.push(points);
        });
    }

    createNebulae() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];
        const rotationOffsets = [];

        const nebulaColors = [
            new THREE.Color(0x220044), // Deep Purple
            new THREE.Color(0x001133), // Deep Blue
            new THREE.Color(0x330022), // Deep Magenta
            new THREE.Color(0x002222)  // Deep Cyan
        ];

        for (let i = 0; i < 200; i++) { // Increase nebula resolution
            const r = 3000 + Math.random() * 5000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );

            const col = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            colors.push(col.r, col.g, col.b);
            sizes.push(4000 + Math.random() * 5000);
            rotationOffsets.push(Math.random() * 100);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('rotOffset', new THREE.Float32BufferAttribute(rotationOffsets, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 0.3 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                attribute float rotOffset;
                varying vec3 vColor;
                varying float vRot;
                void main() {
                    vColor = color;
                    vRot = rotOffset;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (1200.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                varying vec3 vColor;
                varying float vRot;

                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
                               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
                }

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float r = length(uv);
                    if (r > 0.5) discard;
                    
                    // Filmy Noise Texture
                    float n = noise(uv * 10.0 + time * 0.1 + vRot);
                    n += 0.5 * noise(uv * 20.0 - time * 0.05);
                    
                    float glow = 1.0 - (r * 2.0);
                    glow = pow(glow, 5.0);
                    
                    vec3 finalCol = vColor * (n * 0.4 + 0.6) * glow;
                    gl_FragColor = vec4(finalCol * opacity, glow * opacity * n);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.nebulae = new THREE.Points(geometry, material);
        this.scene.add(this.nebulae);
    }

    createShootingStarPool() {
        this.shootingStars = [];
        for (let i = 0; i < 15; i++) { // Increased pool
            const geometry = new THREE.BufferGeometry();
            const material = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                linewidth: 2
            });

            const line = new THREE.Line(geometry, material);
            line.visible = false;
            this.scene.add(line);

            this.shootingStars.push({
                mesh: line,
                active: false,
                startTime: 0,
                duration: 1000,
                startPoint: new THREE.Vector3(),
                endPoint: new THREE.Vector3()
            });
        }
    }

    spawnShootingStar() {
        const star = this.shootingStars.find(s => !s.active);
        if (!star) return;

        const r = 400 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        const start = new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );

        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 200
        );

        star.startPoint.copy(start);
        star.endPoint.copy(start).add(direction);
        star.active = true;
        star.startTime = performance.now();
        star.duration = 500 + Math.random() * 500;
        star.mesh.visible = true;
    }

    updateShootingStars(time) {
        this.shootingStars.forEach(s => {
            if (!s.active) return;
            const elapsed = time - s.startTime;
            const p = elapsed / s.duration;

            if (p >= 1.0) {
                s.active = false;
                s.mesh.visible = false;
                return;
            }

            const current = new THREE.Vector3().lerpVectors(s.startPoint, s.endPoint, p);
            const tail = new THREE.Vector3().lerpVectors(s.startPoint, s.endPoint, Math.max(0, p - 0.1));

            s.mesh.geometry.setFromPoints([tail, current]);
            s.mesh.material.opacity = Math.sin(p * Math.PI);
        });

        if (Math.random() < 0.005) {
            this.spawnShootingStar();
        }
    }

    createMilkyWay() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];
        const offsets = [];

        const count = 60000;
        const colorPalette = [
            new THREE.Color(0x4444ff), // Dark Blue
            new THREE.Color(0x8a2be2), // Purple
            new THREE.Color(0x221155), // Deep Indigo
            new THREE.Color(0xffffff)  // White
        ];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = 1200 + Math.random() * 1800;
            const thickness = 400 * (1.0 - (r - 1200) / 1800);

            positions.push(
                r * Math.cos(angle) + (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * thickness,
                r * Math.sin(angle) + (Math.random() - 0.5) * 100
            );

            const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            const intensity = 0.5 + Math.random() * 0.5;
            colors.push(col.r * intensity, col.g * intensity, col.b * intensity);
            sizes.push(2.0 + Math.random() * 10.0);
            offsets.push(Math.random() * 100);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                attribute float offset;
                varying vec3 vColor;
                varying float vOffset;
                void main() {
                    vColor = color;
                    vOffset = offset;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (600.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                varying vec3 vColor;
                varying float vOffset;
                void main() {
                    float r = length(gl_PointCoord - 0.5);
                    if (r > 0.5) discard;
                    float glow = 1.0 - (r * 2.0);
                    glow = pow(glow, 3.0);
                    float flicker = 0.7 + 0.3 * sin(time * 2.0 + vOffset);
                    gl_FragColor = vec4(vColor * glow * flicker * opacity, glow * opacity * 0.8);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.milkyWay = new THREE.Points(geometry, material);
        this.milkyWay.rotation.x = Math.PI * 0.15;
        this.scene.add(this.milkyWay);
    }

    createSolarSystem() {
        this.solarSystemGroup = new THREE.Group();
        this.solarSystemGroup.position.set(0, 2000, 0);
        this.scene.add(this.solarSystemGroup);

        // --- SUN ---
        // Core with Solar Shader
        const sunGeom = new THREE.SphereGeometry(120, 64, 64);
        const sunMat = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(SolarShader.uniforms),
            vertexShader: SolarShader.vertexShader,
            fragmentShader: SolarShader.fragmentShader
        });
        this.sun = new THREE.Mesh(sunGeom, sunMat);
        this.solarSystemGroup.add(this.sun);

        // Inner Glow (Soft Corona)
        const innerGlowGeom = new THREE.SphereGeometry(150, 64, 64);
        const innerGlowMat = new THREE.MeshBasicMaterial({
            color: 0xff4411,
            transparent: true,
            opacity: 0.4,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        this.sun.add(new THREE.Mesh(innerGlowGeom, innerGlowMat));

        // Outer Corona (Atmospheric 3D)
        for (let i = 0; i < 3; i++) {
            const coronaGeom = new THREE.SphereGeometry(160 + i * 20, 64, 64);
            const coronaMat = new THREE.MeshBasicMaterial({
                color: 0xff4422,
                transparent: true,
                opacity: 0.15 - i * 0.04,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending
            });
            this.sun.add(new THREE.Mesh(coronaGeom, coronaMat));
        }

        // --- PLANETS ---
        const planetConfigs = [
            { name: 'Mercury', size: 10, dist: 280, color: 0xa5a5a5 },
            { name: 'Venus', size: 18, dist: 420, color: 0xe3bb76 },
            { name: 'Earth', size: 20, dist: 600, color: 0x2233ff },
            { name: 'Mars', size: 12, dist: 800, color: 0xff3300 },
            { name: 'Jupiter', size: 45, dist: 1200, color: 0xfcb072 },
            { name: 'Saturn', size: 38, dist: 1600, color: 0xddccaa, hasRings: true },
            { name: 'Uranus', size: 24, dist: 2000, color: 0x88ccff },
            { name: 'Neptune', size: 24, dist: 2400, color: 0x3366ff }
        ];

        planetConfigs.forEach((cfg, i) => {
            const planetGroup = new THREE.Group();

            // Planet body with Atmospheric Shader
            const geom = new THREE.SphereGeometry(cfg.size, 64, 64);
            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    color: { value: new THREE.Color(cfg.color) },
                    sunDirection: { value: new THREE.Vector3(0, 0, 0) }, // Updated in animate
                    time: { value: 0 }
                },
                vertexShader: PlanetShader.vertexShader,
                fragmentShader: PlanetShader.fragmentShader
            });
            const planetMesh = new THREE.Mesh(geom, mat);
            planetGroup.add(planetMesh);

            // Saturn's Rings
            if (cfg.hasRings) {
                const ringGeom = new THREE.RingGeometry(cfg.size * 1.4, cfg.size * 2.2, 64);
                const ringMat = new THREE.MeshStandardMaterial({
                    color: 0x998877,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.6,
                    roughness: 0.8
                });
                const rings = new THREE.Mesh(ringGeom, ringMat);
                rings.rotation.x = Math.PI * 0.45;
                planetGroup.add(rings);
            }

            // Atmosphere Glow (Rim mesh)
            const atmGeom = new THREE.SphereGeometry(cfg.size * 1.05, 64, 64);
            const atmMat = new THREE.MeshBasicMaterial({
                color: cfg.color,
                transparent: true,
                opacity: 0.2,
                side: THREE.BackSide,
                blending: THREE.AdditiveBlending
            });
            planetGroup.add(new THREE.Mesh(atmGeom, atmMat));

            // --- Spatial Audio Anchor (Surround Swoosh Foundation) ---
            const planetAudio = new THREE.PositionalAudio(this.listener);
            planetAudio.setRefDistance(100);
            planetAudio.setRolloffFactor(2);
            if (planetAudio.panner) {
                planetAudio.panner.panningModel = 'equalpower';
            }
            planetMesh.add(planetAudio);

            const orbitGroup = new THREE.Group();
            orbitGroup.add(planetGroup);
            planetGroup.position.x = cfg.dist;

            this.planets.push({
                mesh: orbitGroup,
                planetBody: planetMesh,
                audio: planetAudio,
                dist: cfg.dist,
                angle: Math.random() * Math.PI * 2,
                speed: 0.005 / (cfg.dist / 500)
            });
            this.solarSystemGroup.add(orbitGroup);
        });


        // --- VOLUMETRIC RAYS (3D EFFECT) ---
        for (let i = 0; i < 15; i++) {
            const rayGeom = new THREE.CylinderGeometry(2, 60, 2000, 8);
            const rayMat = new THREE.MeshBasicMaterial({
                color: 0xffcc33,
                transparent: true,
                opacity: 0.1,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
            const ray = new THREE.Mesh(rayGeom, rayMat);
            ray.position.y = 1000;
            const rayPivot = new THREE.Group();
            rayPivot.add(ray);
            rayPivot.rotation.x = Math.random() * Math.PI * 2;
            rayPivot.rotation.z = Math.random() * Math.PI * 2;
            this.sun.add(rayPivot);
        }

        // Light for planets (The Sun)
        const sunLight = new THREE.PointLight(0xffffff, 40, 8000, 1);
        this.solarSystemGroup.add(sunLight);

        this.solarSystemGroup.visible = false;
    }

    createMicroParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        for (let i = 0; i < 6000; i++) {
            positions.push(
                (Math.random() - 0.5) * 5000,
                (Math.random() - 0.5) * 5000,
                (Math.random() - 0.5) * 5000
            );
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            size: 1.5,
            color: 0x88ccff,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.microParticles = new THREE.Points(geometry, material);
        this.scene.add(this.microParticles);
    }

    addEventListeners() {
        window.addEventListener('resize', () => {
            const pr = Math.min(window.devicePixelRatio, 2);

            // 1. Program Canvas (Dome)
            const w = this.canvas.clientWidth || window.innerWidth;
            const h = this.canvas.clientHeight || window.innerHeight;

            if (w > 0 && h > 0) {
                this.renderer.setPixelRatio(pr);
                this.renderer.setSize(w, h, false);
                this.composer.setSize(w, h);
                if (this.fisheyePass) {
                    this.fisheyePass.uniforms.resolution.value.set(w * pr, h * pr);
                }
            }

            // 2. Preview Canvas (Director)
            const pw = this.previewCanvas.clientWidth || window.innerWidth / 2;
            const ph = this.previewCanvas.clientHeight || window.innerHeight / 2;

            if (pw > 0 && ph > 0) {
                this.previewRenderer.setSize(pw, ph, false);
                this.previewCamera.aspect = pw / ph;
                this.previewCamera.updateProjectionMatrix();
            }
        });

        document.getElementById('welcome-image-container').addEventListener('click', () => {
            console.log("Welcome clicked");
            this.start();
        });

        document.getElementById('fullscreen-btn').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Dashboard Buttons
        document.getElementById('master-start-btn').addEventListener('click', () => {
            if (!this.isActive) this.start();
            else this.togglePause();
        });

        // Volume Master
        const volSlider = document.getElementById('volume-slider');
        const volReadout = document.getElementById('volume-readout');
        volSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            volReadout.innerText = `${Math.round(val * 100)}%`;
            if (this.sound) this.sound.setVolume(val);
        });

        // Initialize Volume
        if (this.sound) this.sound.setVolume(parseFloat(volSlider.value));
    }

    togglePause(remote = false) {
        if (this.isActive) {
            if (this.sound.isPlaying) this.sound.pause();
            this.isActive = false;
            const btn = document.getElementById('master-start-btn');
            if (btn) btn.innerText = "RESUME MISSION";
            if (!remote && !this.isProgram) this.channel.postMessage({ type: 'pause' });
        } else {
            if (!this.sound.isPlaying && !this.isProgram) this.sound.play();
            this.isActive = true;
            const btn = document.getElementById('master-start-btn');
            if (btn) btn.innerText = "ABORT MISSION";
            if (!remote && !this.isProgram) this.channel.postMessage({ type: 'resume' });
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            this.enterFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
        }
    }

    enterFullscreen() {
        const doc = document.documentElement;
        if (doc.requestFullscreen) doc.requestFullscreen();
        else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen();
        else if (doc.mozRequestFullScreen) doc.mozRequestFullScreen();
        else if (doc.msRequestFullscreen) doc.msRequestFullscreen();
    }

    start(forcedStartTime = null) {
        if (this.isActive) return;
        console.log("Mission Engage: Sequence Initiated");
        this.isActive = true;
        this.startTime = forcedStartTime || performance.now();

        if (!this.isProgram && !forcedStartTime) {
            this.channel.postMessage({ type: 'start', startTime: this.startTime });
        }

        // Hide overlay if it exists
        const overlay = document.getElementById('welcome-image-container');
        if (overlay) overlay.style.display = 'none';

        document.getElementById('master-start-btn').innerText = "ABORT MISSION";

        // Force Fullscreen on start for dome immersion (only for Program window)
        if (this.isProgram) this.enterFullscreen();

        // Enable cinematic bloom
        if (this.bloomPass) this.bloomPass.enabled = true;

        // Play Spatial Audio (only if not a slave program)
        if (this.sound.buffer && !this.isProgram) {
            this.sound.play();
        }

        requestAnimationFrame((t) => this.animate(t));
    }

    updateTimeline(time) {
        const t = time * 0.001;
        this.elapsedTime = (time - this.startTime) / 1000;

        let cumulativeTime = 0;
        let foundScene = false;

        for (let i = 0; i < CONFIG.timeline.length; i++) {
            const scene = CONFIG.timeline[i];
            if (this.elapsedTime < cumulativeTime + scene.duration) {
                const name = scene.name; // Get name first
                if (this.currentSceneIndex !== i || document.getElementById('current-scene-name').textContent === 'STANDBY') {
                    this.currentSceneIndex = i;
                    document.getElementById('current-scene-name').textContent = name;
                }
                this.handleSceneAnimation(i, this.elapsedTime - cumulativeTime, t);
                foundScene = true;
                break;
            }
            cumulativeTime += scene.duration;
        }

        if (!foundScene && this.elapsedTime > 161) {
            this.handleSceneAnimation(7, 5.9, t);
        }
    }

    handleSceneAnimation(index, sceneTime, t) {
        const scene = CONFIG.timeline[index];
        const progress = sceneTime / scene.duration;

        const setStarOpacity = (opacity) => {
            this.starLayers.forEach(layer => {
                layer.material.uniforms.opacity.value = opacity;
            });
        };

        // Smooth transition easing for camera paths
        const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const eProgress = easeInOut(progress);

        // Cinematic Swoosh & Zoom Dynamics
        const swooshProgress = Math.pow(progress, 3.0); // Extreme acceleration at end of scenes
        const rotationSwoosh = Math.sin(progress * Math.PI) * 0.02;

        switch (index) {
            case 0: // Emergence
                setStarOpacity(0);
                this.milkyWay.material.uniforms.opacity.value = 0;
                this.nebulae.material.uniforms.opacity.value = 0;
                if (sceneTime > 2.0) {
                    setStarOpacity((sceneTime - 2.0) / 8.0 * 0.6);
                }
                this.cubeCamera.position.y += Math.sin(t * 0.2) * 5; // Slow float
                break;
            case 1: // The Great Silence
                setStarOpacity(0.6 + progress * 0.4);
                this.nebulae.material.uniforms.opacity.value = progress * 0.7;
                // Accelerating drift (Swoosh build-up)
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * (10 + swooshProgress * 100);
                this.cubeCamera.rotation.z += 0.0001 + rotationSwoosh;
                break;
            case 2: // Celestial Structures
                this.milkyWay.material.uniforms.opacity.value = progress * 2.5;
                // Majestic orbiting swoop
                const radius = 200 + progress * 300;
                this.cubeCamera.position.x = Math.sin(progress * Math.PI) * radius;
                this.cubeCamera.position.z = Math.cos(progress * Math.PI) * radius;
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 40;
                this.cubeCamera.rotation.y += 0.002;
                break;
            case 3: // Systems of Light
                this.solarSystemGroup.visible = true;
                const solarDist = THREE.MathUtils.lerp(8000, 700, eProgress);
                this.solarSystemGroup.position.set(0, solarDist, 0);
                // Rapid descent swoop
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * (10 + eProgress * 50);
                this.cubeCamera.rotation.x += Math.sin(progress * 5.0) * 0.005;
                break;
            case 4: // Transcendence
                this.solarSystemGroup.position.y = THREE.MathUtils.lerp(700, 30000, eProgress);
                // The big warp swoop
                const warpSpeed = CONFIG.cameraDriftSpeed * (20 + swooshProgress * 500);
                this.cubeCamera.position.y += warpSpeed;
                this.cubeCamera.rotation.z += 0.001 + swooshProgress * 0.05;
                this.cubeCamera.rotation.x += rotationSwoosh;
                break;
            case 5: // Infinite Scale
                this.milkyWay.material.uniforms.opacity.value = 1.0 - progress * 0.5;
                this.nebulae.material.uniforms.opacity.value = 0.7 + progress * 0.3;
                // High-altitude slow-motion drift
                this.cubeCamera.position.y += Math.pow(progress, 3.0) * 2000;
                this.cubeCamera.rotation.y += 0.001;
                break;
            case 6: // Stardust Memory
                setStarOpacity(1.0 - progress * 0.7);
                this.cubeCamera.rotation.y += CONFIG.rotationSpeed * 0.02;
                this.cubeCamera.position.y += 50;
                break;
        }

        // Global IMAX Camera Drift (Heavy & Cinematic)
        this.cubeCamera.rotation.y += CONFIG.rotationSpeed * 0.6;
        this.cubeCamera.rotation.x += CONFIG.rotationSpeed * 0.3;

        // Dynamic 3D Rotation (Handheld Swoosh Jitter)
        this.cubeCamera.rotation.x += Math.sin(t * 1.2) * 0.003;
        this.cubeCamera.rotation.z += Math.cos(t * 1.1) * 0.002;
        this.cubeCamera.rotation.y += Math.sin(t * 0.5) * 0.001;

        // Planet orbits & Shader Updates
        this.planets.forEach(p => {
            p.angle += p.speed;
            p.mesh.rotation.y = p.angle;

            p.planetBody.material.uniforms.time.value = t;

            const planetPos = new THREE.Vector3();
            p.planetBody.getWorldPosition(planetPos);
            const sunPos = new THREE.Vector3();
            this.sun.getWorldPosition(sunPos);

            const dir = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
            p.planetBody.material.uniforms.sunDirection.value.copy(dir);
        });

        // Sun & Rays rotation
        if (this.sun) {
            this.sun.rotation.y += 0.002;
            this.sun.rotation.z += 0.001;
            // Rays are children, so they'll rotate with sun
        }
    }

    updateDashboard(time) {
        const elapsed = (time - this.startTime) / 1000;
        const total = 161; // 2 minutes 41 seconds
        const progress = Math.min(elapsed / total, 1);

        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        const ms = Math.floor((elapsed % 1) * 100);

        document.getElementById('time-display').innerText =
            `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;

        // Timeline Tracker Update
        document.getElementById('timeline-progress-bar').style.width = `${progress * 100}%`;

        // Sync Script Lines
        const scriptLines = document.querySelectorAll('.script-line');
        let currentLine = scriptLines[0]; // Default to first line
        scriptLines.forEach(line => {
            const start = parseFloat(line.getAttribute('data-start'));
            if (elapsed >= start) {
                currentLine = line;
            }
        });

        if (currentLine) {
            scriptLines.forEach(l => l.classList.remove('active'));
            currentLine.classList.add('active');
            // Use block: 'start' with some offset logic if possible, or center
            currentLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    jumpToScene(index) {
        let cumulative = 0;
        for (let i = 0; i < index; i++) {
            cumulative += CONFIG.timeline[i].duration;
        }

        this.startTime = performance.now() - (cumulative * 1000);
        this.currentSceneIndex = index;

        if (!this.isProgram) {
            this.channel.postMessage({ type: 'jump', index: index });
        }

        // Sync audio if possible
        if (this.sound && this.sound.buffer && !this.isProgram) {
            if (this.sound.isPlaying) this.sound.stop();
            this.sound.play(cumulative);
        }
    }

    launchProgramWindow() {
        const url = window.location.origin + window.location.pathname + '?mode=program';
        window.open(url, 'Planetarium_Program', 'width=1920,height=1080');
    }

    animate(time) {
        requestAnimationFrame(this._animate);
        if (!time) return;

        const t = time * 0.001;

        if (this.isActive) {
            this.updateTimeline(time);
            this.updateShootingStars(time);
            this.updateDashboard(time);
        }

        // Sync Preview Camera to follow CubeCamera
        // To make preview and program "the same pic", we point the preview camera 
        // towards the Zenith (+Y) or the Forward horizon (+Z) of the dome.
        this.previewCamera.position.copy(this.cubeCamera.position);

        // This alignment ensures the Perspective Director view looks exactly where 
        // the dome center is pointed.
        this.previewCamera.rotation.set(-Math.PI / 2, 0, 0); // Look at Zenith (+Y)
        this.previewCamera.quaternion.multiplyQuaternions(this.cubeCamera.quaternion, this.previewCamera.quaternion);

        // Update shaders
        this.starLayers.forEach(layer => {
            layer.material.uniforms.time.value = t;
        });

        if (this.milkyWay && this.milkyWay.material.uniforms) {
            this.milkyWay.material.uniforms.time.value = t;
        }

        if (this.nebulae && this.nebulae.material.uniforms) {
            this.nebulae.material.uniforms.time.value = t;
        }

        if (this.cinematicPass) {
            this.cinematicPass.uniforms.time.value = t;
        }

        if (this.sun && this.sun.material.uniforms) {
            this.sun.material.uniforms.time.value = t;
        }

        // 1. Render for Dome (Fisheye Program)
        this.cubeCamera.update(this.renderer, this.scene);
        this.composer.render();

        // 2. Render for Director Menu (Preview Monitor)
        this.previewRenderer.render(this.scene, this.previewCamera);
    }
}

window.addEventListener('load', () => {
    console.log("Planetarium starting...");
    try {
        new Planetarium();
    } catch (e) {
        console.error("Initialization failed:", e);
        alert("Failed to initialize Planetarium. This usually happens if you open the file directly in a browser due to security (CORS) restrictions. Please use a local web server.");
    }
});
