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
            float aspect = resolution.x / resolution.y;
            
            if (aspect > 1.0) {
                uv.x *= aspect;
            } else {
                uv.y /= aspect;
            }
            
            float r = length(uv);
            
            // Anti-aliasing for the circular edge
            float alpha = 1.0 - smoothstep(0.995, 1.0, r);
            
            if (r > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            float theta = atan(uv.y, uv.x);
            float phi = r * PI * 0.5;

            // Proper orientation for dome projection (looking up into the hemisphere)
            vec3 dir = vec3(
                sin(phi) * cos(theta),
                cos(phi), // Center of dome is up
                sin(phi) * sin(theta)
            );
            
            vec4 color = textureCube(tCube, dir);
            
            // Exposure boost to make it "easy to see"
            color.rgb *= 1.2;
            
            gl_FragColor = vec4(color.rgb * alpha, 1.0);
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
        void main() {
            vColor = color;
            vOffset = offset;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
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
            
            // Soft glow
            float glow = 1.0 - (r * 2.0);
            glow = pow(glow, 2.0);
            
            // Twinkle
            float twinkle = 0.8 + 0.2 * sin(time * 3.0 + vOffset);
            
            gl_FragColor = vec4(vColor * glow * twinkle * opacity, glow * opacity);
        }
    `
};

const CinematicShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'time': { value: 0 },
        'amount': { value: 0.003 }, // Reduced grain
        'chromaticAberration': { value: 0.001 } // Reduced blur
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
            // Chromatic Aberration
            vec2 rUv = vUv + vec2(chromaticAberration, 0.0);
            vec2 gUv = vUv;
            vec2 bUv = vUv - vec2(chromaticAberration, 0.0);

            vec4 rCol = texture2D(tDiffuse, rUv);
            vec4 gCol = texture2D(tDiffuse, gUv);
            vec4 bCol = texture2D(tDiffuse, bUv);

            vec4 color = vec4(rCol.r, gCol.g, bCol.b, gCol.a);

            // Film Grain
            float grain = (random(vUv + time) - 0.5) * amount;
            color.rgb += grain;

            // Subtle IMAX contrast shift (Lift/Gamma/Gain approximation)
            color.rgb = pow(color.rgb, vec3(1.15)); // Slightly more contrast
            color.rgb *= 1.15; // Slightly more gain

            gl_FragColor = color;
        }
    `
};

const PlanetShader = {
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        uniform vec3 color;
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            
            // Diffuse lighting from sun
            float dotNL = max(dot(normal, normalize(sunDirection)), 0.0);
            
            // Atmospheric rim light
            float rim = 1.0 - max(dot(viewDir, normal), 0.0);
            rim = pow(rim, 4.0);
            
            vec3 finalColor = color * (dotNL * 0.8 + 0.2); // Base + Ambient
            finalColor += color * rim * 0.5; // Rim glow
            
            gl_FragColor = vec4(finalColor, 1.0);
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

        this.init();
        this.addEventListeners();
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.uiScene, this.finalCamera);
        this.composer.addPass(renderPass);

        this.fisheyePass = new ShaderPass(FisheyeShader);
        this.fisheyePass.uniforms['tCube'].value = this.cubeCamera.renderTarget.texture;
        this.composer.addPass(this.fisheyePass);

        // Stronger bloom for those bright celestial bodies
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            2.5, 0.4, 0.85
        );
        this.composer.addPass(this.bloomPass);

        // Pass 4: Cinematic IMAX Grade (Grain + Chromatic Aberration)
        this.cinematicPass = new ShaderPass(CinematicShader);
        this.composer.addPass(this.cinematicPass);

        console.log("Post-processing setup complete.");
    }

    init() {
        this.createStarField();
        this.createNebulae();
        this.createMilkyWay();
        this.createSolarSystem();
        this.createMicroParticles();
        this.createShootingStarPool();
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

        const nebulaColors = [
            new THREE.Color(0x220044), // Deep Purple
            new THREE.Color(0x001133), // Deep Blue
            new THREE.Color(0x330022), // Deep Magenta
            new THREE.Color(0x002222)  // Deep Cyan
        ];

        for (let i = 0; i < 120; i++) {
            const r = 3000 + Math.random() * 4000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );

            const col = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            colors.push(col.r, col.g, col.b);
            sizes.push(3000 + Math.random() * 4000);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                opacity: { value: 0.3 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (1000.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    float r = length(gl_PointCoord - 0.5);
                    if (r > 0.5) discard;
                    float glow = 1.0 - (r * 2.0);
                    glow = pow(glow, 4.0);
                    gl_FragColor = vec4(vColor * glow, glow * 0.5);
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
        // Core
        const sunGeom = new THREE.SphereGeometry(120, 64, 64);
        const sunMat = new THREE.MeshBasicMaterial({
            color: 0xfff5cc,
            transparent: true,
            opacity: 1.0
        });
        this.sun = new THREE.Mesh(sunGeom, sunMat);
        this.solarSystemGroup.add(this.sun);

        // Inner Glow
        const innerGlowGeom = new THREE.SphereGeometry(140, 64, 64);
        const innerGlowMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.6,
            side: THREE.BackSide
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
                    sunDirection: { value: new THREE.Vector3(0, 0, 0) } // Updated in animate
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

        // --- PLANETS ---
        // ... (rest of the planet logic)

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
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
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
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 10;
                break;
            case 2: // Milky Way
                this.milkyWay.material.uniforms.opacity.value = progress * 1.2;
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 15;
                break;
            case 3: // Solar System
                this.solarSystemGroup.visible = true;
                const solarDist = THREE.MathUtils.lerp(3000, 1000, progress);
                this.solarSystemGroup.position.set(0, solarDist, 0);
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 5;
                break;
            case 4: // Zoom Out
                this.solarSystemGroup.position.y = THREE.MathUtils.lerp(1000, 10000, progress);
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 20;
                break;
            case 5: // Cosmic Scale
                this.milkyWay.material.uniforms.opacity.value = 1.0 - progress * 0.3;
                this.nebulae.material.uniforms.opacity.value = 0.5 + progress * 0.3;
                this.cubeCamera.position.y += CONFIG.cameraDriftSpeed * 30;
                break;
            case 6: // Final Sky
                setStarOpacity(1 - progress * 0.5);
                this.cubeCamera.rotation.y += CONFIG.rotationSpeed * 0.1;
                // Narration script removed as requested
                break;
        }

        // Global drift/rotation
        this.cubeCamera.rotation.y += CONFIG.rotationSpeed;
        this.cubeCamera.rotation.x += CONFIG.rotationSpeed * 0.5;

        // Planet orbits & Shader Lighting
        this.planets.forEach(p => {
            p.angle += p.speed;
            p.mesh.rotation.y = p.angle;

            // Calculate sun direction for realistic shading
            // The sun is at (0,0,0) in the solarSystemGroup.
            // The planet is at some X distance, but we need the world vector.
            const planetPos = new THREE.Vector3();
            p.planetBody.getWorldPosition(planetPos);
            const sunPos = new THREE.Vector3();
            this.sun.getWorldPosition(sunPos);

            const dir = new THREE.Vector3().subVectors(sunPos, planetPos).normalize();
            p.planetBody.material.uniforms.sunDirection.value.copy(dir);
        });

        // Sun rays rotation
        if (this.sun) {
            this.sun.rotation.y += 0.005;
            this.sun.rotation.z += 0.003;
        }
    }

    animate(time) {
        if (!this.isActive || !time) {
            if (this.isActive) requestAnimationFrame(this.animate.bind(this));
            return;
        }
        requestAnimationFrame(this.animate.bind(this));

        const t = time * 0.001;
        this.updateTimeline(time);
        this.updateShootingStars(time);

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
