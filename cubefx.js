// cubefx.js — Solid cube that shatters into star-like fragments on scroll (theme-aware shards + 1s pulse)
(() => {
    const host = document.getElementById('cube-bg');
    if (!host || typeof THREE === 'undefined') return;

    // Respect reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // --- THREE setup ------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(DPR);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(0, 0.2, 12);

    // Pull brand colors from CSS variables (fallbacks if missing)
    const css = getComputedStyle(document.documentElement);
    const col = (v, fb) => (css.getPropertyValue(v).trim() || fb);
    const ACCENT = new THREE.Color(col('--accent', '#6fd3ff'));
    const ACCENT2 = new THREE.Color(col('--accent-2', '#a78bfa'));
    const CTA = new THREE.Color(col('--cta', '#ffe74a'));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(5, 6, 8);
    scene.add(key);

    // --- 1) The intact hero cube -----------------------------------------
    const HERO_SIZE = 1.5;
    const heroMat = new THREE.MeshPhongMaterial({
        color: ACCENT2.clone().lerp(CTA, 0.18),
        shininess: 28,
        transparent: true,
        opacity: 0.95
    });
    const hero = new THREE.Mesh(new THREE.BoxGeometry(HERO_SIZE, HERO_SIZE, HERO_SIZE), heroMat);
    scene.add(hero);

    // Outline lines (helps the “solid” feel)
    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(HERO_SIZE, HERO_SIZE, HERO_SIZE)),
        new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 })
    );
    scene.add(edges);

    // --- 2) Shatter fragments → star-like voxels --------------------------
    const N = 12;                          // cubes per axis (12^3 = 1728)
    const COUNT = N * N * N;
    const VOX = (HERO_SIZE / N) * 0.35;    // small "star" points
    const voxGeo = new THREE.BoxGeometry(VOX, VOX, VOX);

    // Additive for glow, depthWrite off so overlaps glow nicely
    const voxMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,                      // DARK MODE default (white stars)
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const voxels = new THREE.InstancedMesh(voxGeo, voxMat, COUNT);
    voxels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    voxels.frustumCulled = false;
    voxels.visible = false;
    scene.add(voxels);

    // Per-fragment state
    const offsets = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const spins = new Float32Array(COUNT * 3);
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3); // harmless (not used by mat)

    // Fill voxel positions centered on origin + gentle initial velocity
    let i = 0;
    const half = (N - 1) / 2;
    for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
            for (let z = 0; z < N; z++) {
                const px = (x - half) * (HERO_SIZE / N);
                const py = (y - half) * (HERO_SIZE / N);
                const pz = (z - half) * (HERO_SIZE / N);

                offsets[i * 3 + 0] = px;
                offsets[i * 3 + 1] = py;
                offsets[i * 3 + 2] = pz;

                const dir = new THREE.Vector3(px, py, pz).normalize();
                const rand = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8);
                const speed = 1.0 + Math.random() * 2.0;        // slower blast
                const v = dir.multiplyScalar(speed).add(rand);

                velocities[i * 3 + 0] = v.x;
                velocities[i * 3 + 1] = v.y;
                velocities[i * 3 + 2] = v.z;

                spins[i * 3 + 0] = (Math.random() - 0.5) * 3.0;
                spins[i * 3 + 1] = (Math.random() - 0.5) * 3.0;
                spins[i * 3 + 2] = (Math.random() - 0.5) * 3.0;

                const c = new THREE.Color().lerpColors(CTA, new THREE.Color(0xffffff), Math.random() * 0.35);
                colors.array[i * 3 + 0] = c.r; colors.array[i * 3 + 1] = c.g; colors.array[i * 3 + 2] = c.b;

                i++;
            }
        }
    }
    voxels.geometry.setAttribute('instColor', colors);

    // --- 3) Starfield (background, drifts after explosion) ----------------
    const STARS = 1200;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(STARS * 3);
    for (let s = 0; s < STARS; s++) {
        starPos[s * 3 + 0] = (Math.random() - 0.5) * 140;
        starPos[s * 3 + 1] = (Math.random() - 0.5) * 80;
        starPos[s * 3 + 2] = (Math.random() - 0.5) * 160 - 40;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0.35, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    stars.visible = false;
    scene.add(stars);

    // ---- light/dark theme adaptation -------------------------------------
    const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';

    let baseEdgeOpacity = 0.55;
    function applyTheme() {
        const light = isLight();

        // intact cube & edges
        heroMat.color.set(light ? '#8a8f98' : ACCENT2.clone().lerp(CTA, 0.18));
        edges.material.color.set(light ? '#1a1a1a' : ACCENT);
        baseEdgeOpacity = light ? 0.80 : 0.55;

        // **shattered fragments color**: black in light mode, white in dark
        voxMat.color.set(light ? '#111111' : '#ffffff');

        // starfield color: charcoal on light, white on dark
        starMat.color.set(light ? '#1a1a1a' : 0xffffff);

        // camera tweak
        camera.position.z = light ? 12.5 : 12;
    }
    applyTheme();
    new MutationObserver(applyTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });

    // --- 4) Scroll trigger & state ---------------------------------------
    let shattered = false;
    let boomTime = 0;                  // when explosion started
    let heroOpacity = 1;

    const triggerOffset = 80;          // px to start the shatter
    function checkScroll() {
        if (!shattered && window.scrollY > triggerOffset) {
            startShatter();
        }
    }
    window.addEventListener('scroll', checkScroll, { passive: true });

    function startShatter() {
        shattered = true;
        voxels.visible = true;
        stars.visible = true;
        boomTime = performance.now();
        // ensure correct shard color if user toggled theme before shatter
        applyTheme();
    }

    // --- 5) Update loop ---------------------------------------------------
    const m = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const tmp = new THREE.Vector3();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    let tPrev = performance.now();
    let raf = 0;

    function animate(tNow) {
        const dt = Math.min(50, tNow - tPrev) / 1000;
        tPrev = tNow;

        // 1-second global pulse (0..1)
        const pulse = 0.5 + 0.5 * Math.sin(tNow * (2 * Math.PI / 1000));

        if (!shattered) {
            // idle: rotate cube gently
            hero.rotation.x += 0.20 * dt;
            hero.rotation.y += 0.12 * dt;
            edges.rotation.copy(hero.rotation);
        } else {
            // fade out hero quickly
            heroOpacity = Math.max(0, heroOpacity - dt * 2.2);
            heroMat.opacity = heroOpacity;
            edges.material.opacity = heroOpacity * baseEdgeOpacity;

            // simulate fragments: gentle drift (so they stay on screen)
            const since = (tNow - boomTime) / 1000;
            const accel = 0.1;   // tiny outward push
            const drag = 1.0;   // coast
            let idx = 0;

            for (let n = 0; n < COUNT; n++) {
                // velocity update
                const vx = (velocities[idx + 0] *= drag);
                const vy = (velocities[idx + 1] = (velocities[idx + 1] - dt * 0.1) * drag); // light gravity
                const vz = (velocities[idx + 2] *= drag);

                // tiny acceleration away from center
                tmp.set(offsets[idx + 0], offsets[idx + 1], offsets[idx + 2]).normalize().multiplyScalar(accel * dt);
                velocities[idx + 0] += tmp.x;
                velocities[idx + 1] += tmp.y;
                velocities[idx + 2] += tmp.z;

                // integrate
                const x = offsets[idx + 0] + vx * since;
                const y = offsets[idx + 1] + vy * since;
                const z = offsets[idx + 2] + vz * since;

                // spin
                euler.set(spins[idx + 0] * since, spins[idx + 1] * since, spins[idx + 2] * since);

                m.makeRotationFromEuler(euler);
                m.setPosition(x, y, z);
                voxels.setMatrixAt(n, m);

                idx += 3;
            }
            voxels.instanceMatrix.needsUpdate = true;

            // PULSE: make all fragments glow together once per second
            voxMat.opacity = 0.25 + 0.75 * pulse; // range 0.25–1.0

            // starfield: brighten and drift, also breathe with pulse
            const starOp = easeOutCubic(Math.min(1, since / 1.2)) * 0.55;
            starMat.opacity = (0.15 + starOp) * (0.65 + 0.35 * pulse);
            stars.rotation.y -= dt * 0.03;
            stars.position.z += dt * 0.3; // slower flight so the universe lingers
        }

        // subtle background roll for depth
        scene.rotation.z = Math.sin(tNow * 0.0001) * 0.04;

        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);

    // pause when tab hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else { tPrev = performance.now(); raf = requestAnimationFrame(animate); }
    });

    // responsive
    window.addEventListener('resize', () => {
        const { innerWidth: w, innerHeight: h } = window;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    });

    // kick the scroll check initially (in case the page loads mid-scroll)
    checkScroll();
})();
