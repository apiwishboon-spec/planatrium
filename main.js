import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// --- CONFIGURATION ---
const CONFIG = {
    starCount: 60000, // Significant increase
    nebulaCount: 40,
    cameraDriftSpeed: 0.003,
    rotationSpeed: 0.002,
    timeline: [
        { name: 'Void', duration: 4 },
        { name: 'Deep Space Build', duration: 25 },
        { name: 'Milky Way', duration: 20 },
        { name: 'Solar System', duration: 25 },
        { name: 'Zoom Out', duration: 25 },
        { name: 'Cosmic Scale', duration: 15 },
        { name: 'Final Sky', duration: 6 }
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
            vec2 uv = (vUv - 0.5) * 2.0;
            float aspect = resolution.x / max(resolution.y, 1.0);
            
            if (aspect > 1.0) uv.x *= aspect;
            else uv.y /= max(aspect, 0.1);
            
            float r = length(uv);
            if (r > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            float theta = atan(uv.y, uv.x);
            float phi = r * PI * 0.5;

            vec3 dir = vec3(
                sin(phi) * cos(theta),
                cos(phi),
                sin(phi) * sin(theta)
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

            // Vignette
            float dist = length(uv - 0.5);
            float vignette = smoothstep(0.8, 0.4, dist);
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
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Scenes
        this.scene = new THREE.Scene(); // Real world scene
        this.uiScene = new THREE.Scene(); // Final output scene

        // Cameras
        // Higher resolution for the cube camera to avoid "ugly" pixelation
        const cubeRes = 2048;
        this.cubeCamera = new THREE.CubeCamera(0.1, 20000, new THREE.WebGLCubeRenderTarget(cubeRes, {
            generateMipmaps: true,
            minFilter: THREE.LinearMipmapLinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            colorSpace: THREE.SRGBColorSpace
        }));
        this.scene.add(this.cubeCamera);

        this.finalCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Post-processing
        this.setupPostProcessing();

        // Scene content
        this.stars = null;
        this.milkyWay = null;
        this.sun = null;
        this.planets = [];
        this.shootingStars = [];

        // State
        this.startTime = 0;
        this.elapsedTime = 0;
        this.isActive = false;
        this.currentSceneIndex = 0;

        // Welcome Dome Group
        this.welcomeGroup = new THREE.Group();
        this.scene.add(this.welcomeGroup);

        this.init();
        this.addEventListeners();

        // Start animation loop immediately
        requestAnimationFrame((t) => this.animate(t));
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        this.fisheyePass = new ShaderPass(FisheyeShader);
        this.fisheyePass.uniforms['tCube'].value = this.cubeCamera.renderTarget.texture;
        this.composer.addPass(this.fisheyePass);

        // ... bloom ...

        // Cinematic Bloom (Disabled until START)
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, 0.4, 0.85 // Normal strength for later
        );
        this.bloomPass.enabled = false;
        this.composer.addPass(this.bloomPass);

        // Pass 4: Cinematic IMAX Grade (Grain + Chromatic Aberration)
        this.cinematicPass = new ShaderPass(CinematicShader);
        this.composer.addPass(this.cinematicPass);

        console.log("Post-processing setup complete.");
    }

    init() {
        this.createWelcomeDome();
        this.createStarField();
        this.createNebulae();
        this.createMilkyWay();
        this.createSolarSystem();
        this.createMicroParticles();
        this.createShootingStarPool();
    }

    createWelcomeDome() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');

        // Draw background (transparent)
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Drawing colors from reference
        const pinkRed = '#ff6b6b';
        const saturnOrange = '#ffad5a';
        const textWhite = 'rgba(255,255,255,0.95)';

        // SAC Logo (Top)
        ctx.strokeStyle = textWhite;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(512, 180, 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = textWhite;
        ctx.font = 'bold 90px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('SAC+', 512, 215);

        // Rocket drawing (Left, tilted slightly)
        ctx.save();
        ctx.translate(250, 480);
        ctx.rotate(-Math.PI * 0.1);
        ctx.fillStyle = pinkRed;
        ctx.beginPath();
        ctx.moveTo(0, -180);
        ctx.quadraticCurveTo(80, 0, 80, 150);
        ctx.lineTo(-80, 150);
        ctx.quadraticCurveTo(-80, 0, 0, -180);
        ctx.fill();
        // Rocket fins
        ctx.beginPath();
        ctx.moveTo(-80, 100);
        ctx.lineTo(-120, 150);
        ctx.lineTo(-80, 150);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(80, 100);
        ctx.lineTo(120, 150);
        ctx.lineTo(80, 150);
        ctx.fill();
        ctx.restore();

        // Saturn drawing (Right, with soft glow)
        ctx.save();
        ctx.translate(774, 480);
        ctx.fillStyle = saturnOrange;
        ctx.beginPath();
        ctx.arc(0, 0, 110, 0, Math.PI * 2);
        ctx.fill();
        // Rings
        ctx.strokeStyle = 'rgba(255,180,255,0.6)';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.ellipse(0, 0, 200, 50, Math.PI * 0.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Welcome Text (Centered)
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '300 50px Outfit';
        ctx.fillText('WELCOME TO', 512, 600);

        ctx.fillStyle = textWhite;
        ctx.font = 'bold 85px Outfit';
        ctx.letterSpacing = "6px";
        ctx.fillText('SIRINDHORN PLANETARIUM', 512, 710);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 16;

        const mat = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });

        // Zenith placement - Corrected orientation
        const geom = new THREE.PlaneGeometry(1200, 1200);
        this.welcomeMesh = new THREE.Mesh(geom, mat);
        this.welcomeMesh.position.set(0, 500, 0);
        this.welcomeMesh.rotation.x = -Math.PI * 0.5; // Flip to face downward
        this.welcomeMesh.rotation.z = 0; // Remove rotation correction
        this.welcomeGroup.add(this.welcomeMesh);
    }

    createStarField() {
        this.starLayers = [];
        const layerConfigs = [
            { count: CONFIG.starCount * 0.3, size: 14.0, spread: 1200, color: 0xffffff }, // Near
            { count: CONFIG.starCount * 0.6, size: 7.0, spread: 2500, color: 0xccccff },  // Mid
            { count: CONFIG.starCount * 1.5, size: 4.0, spread: 5000, color: 0xaaaaff },  // Far
            { count: CONFIG.starCount * 3.0, size: 2.0, spread: 10000, color: 0x6666ff }  // Deep Field
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

            const orbitGroup = new THREE.Group();
            orbitGroup.add(planetGroup);
            planetGroup.position.x = cfg.dist;

            this.planets.push({
                mesh: orbitGroup,
                planetBody: planetMesh,
                speed: 0.003 / (i + 1),
                angle: Math.random() * Math.PI * 2
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
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.renderer.setSize(w, h);
            this.composer.setSize(w, h);
            if (this.fisheyePass) {
                this.fisheyePass.uniforms.resolution.value.set(w, h);
            }
        });

        document.getElementById('start-button').addEventListener('click', () => {
            this.start();
        });
    }

    start() {
        this.isActive = true;
        this.startTime = performance.now();
        document.getElementById('welcome-screen').classList.add('hidden');
        document.getElementById('scene-info').classList.remove('hidden');

        // Enable cinematic bloom now that the text is gone
        if (this.bloomPass) this.bloomPass.enabled = true;

        // Fade out welcome dome
        new Promise(resolve => {
            const fade = () => {
                if (this.welcomeMesh.material.opacity > 0) {
                    this.welcomeMesh.material.opacity -= 0.05;
                    requestAnimationFrame(fade);
                } else {
                    this.welcomeGroup.visible = false;
                    resolve();
                }
            };
            fade();
        });

        const audio = document.getElementById('bg-music');
        audio.play().catch(e => console.error("Audio playback failed", e));

        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { });
        }

        requestAnimationFrame((t) => this.animate(t));
    }

    updateTimeline(time) {
        this.elapsedTime = (time - this.startTime) / 1000;

        let cumulativeTime = 0;
        let foundScene = false;

        for (let i = 0; i < CONFIG.timeline.length; i++) {
            const scene = CONFIG.timeline[i];
            if (this.elapsedTime < cumulativeTime + scene.duration) {
                if (this.currentSceneIndex !== i) {
                    this.currentSceneIndex = i;
                    document.getElementById('scene-name').textContent = scene.name;
                }
                this.handleSceneAnimation(i, this.elapsedTime - cumulativeTime);
                foundScene = true;
                break;
            }
            cumulativeTime += scene.duration;
        }

        if (!foundScene && this.elapsedTime > 120) {
            // Reset or hold
            this.handleSceneAnimation(6, 5);
        }
    }

    handleSceneAnimation(index, sceneTime) {
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

        switch (index) {
            case 0: // Void
                setStarOpacity(0);
                this.milkyWay.material.uniforms.opacity.value = 0;
                this.nebulae.material.uniforms.opacity.value = 0;
                if (sceneTime > 0.5) {
                    setStarOpacity((sceneTime - 0.5) / 2 * 0.4);
                }
                break;
            case 1: // Deep Space Build
                setStarOpacity(0.4 + progress * 0.6);
                this.nebulae.material.uniforms.opacity.value = progress * 0.5;
                // Move from Deep Space to Milky Way on a curve
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * (10 + progress * 20);
                this.cubeCamera.rotation.z += 0.0001;
                break;
            case 2: // Milky Way
                this.milkyWay.material.uniforms.opacity.value = progress * 1.5;
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * (30 - progress * 10);
                this.cubeCamera.position.x = Math.sin(progress * Math.PI) * 100;
                break;
            case 3: // Solar System
                this.solarSystemGroup.visible = true;
                const solarDist = THREE.MathUtils.lerp(4000, 800, eProgress);
                this.solarSystemGroup.position.set(0, solarDist, 0);
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 5;
                break;
            case 4: // Zoom Out
                this.solarSystemGroup.position.y = THREE.MathUtils.lerp(800, 15000, eProgress);
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * (20 + progress * 40);
                this.cubeCamera.rotation.z += 0.0005;
                break;
            case 5: // Cosmic Scale
                this.milkyWay.material.uniforms.opacity.value = 1.0 - progress * 0.5;
                this.nebulae.material.uniforms.opacity.value = 0.5 + progress * 0.4;
                this.cubeCamera.position.y += Math.pow(progress, 2.0) * 500;
                break;
            case 6: // Final Sky
                setStarOpacity(1.2 - progress * 0.6);
                this.cubeCamera.rotation.y += CONFIG.rotationSpeed * 0.1;
                break;
        }

        // Global drift
        this.cubeCamera.rotation.y += CONFIG.rotationSpeed * 0.5;
        this.cubeCamera.rotation.x += CONFIG.rotationSpeed * 0.2;

        // Cinematic Camera Jitter (Heavy Handheld Feel)
        const t = performance.now() * 0.001;
        this.cubeCamera.rotation.x += Math.sin(t * 0.8) * 0.002;
        this.cubeCamera.rotation.z += Math.cos(t * 0.7) * 0.0015;

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

    animate(time) {
        requestAnimationFrame(this.animate.bind(this));
        if (!this.isActive && !this.welcomeGroup.visible) return; // Completely idle 
        if (!time) return;

        const t = time * 0.001;

        if (this.isActive) {
            this.updateTimeline(time);
            this.updateShootingStars(time);
        }

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

        // 1. Render scene to cube map
        this.cubeCamera.update(this.renderer, this.scene);

        // 2. Composite the fisheye view
        this.composer.render();
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
