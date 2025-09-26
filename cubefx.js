// cubefx.js — Solid cube that shatters into star-like fragments on scroll
(() => {
    const host = document.getElementById('cube-bg');
    if (!host) return;

    // Respect reduced motion
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

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
    const HERO_SIZE = 0.1;
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

    // --- 2) The shatter fragments (instanced voxels) ----------------------
    // We prebuild tiny cubes in a grid inside the hero cube. On shatter, they fly out.
    const N = 2;                          // cubes per axis (12^3 = 1728; tune if heavy)
    const COUNT = N * N * N;
    const VOX = HERO_SIZE / N * 0.9;       // voxel size with a gap
    const voxGeo = new THREE.BoxGeometry(VOX, VOX, VOX);
    const voxMat = new THREE.MeshBasicMaterial({ color: CTA, transparent: true, opacity: 0.0 });
    const voxels = new THREE.InstancedMesh(voxGeo, voxMat, COUNT);
    voxels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    voxels.frustumCulled = false;
    scene.add(voxels);
    voxels.visible = false;

    // Per-fragment state
    const origin = new THREE.Vector3();
    const offsets = new Float32Array(COUNT * 3);  // initial local positions (packed)
    const velocities = new Float32Array(COUNT * 3);
    const spins = new Float32Array(COUNT * 3);    // per-fragment rotation speeds
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);

    // Fill voxel positions centered on origin + give outward velocities
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
                const rand = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.8,
                    (Math.random() - 0.5) * 0.8,
                    (Math.random() - 0.5) * 0.8
                );
                const speed = 1.0 + Math.random() * 6.0;        // initial burst speed
                const v = dir.multiplyScalar(speed).add(rand);

                velocities[i * 3 + 0] = v.x;
                velocities[i * 3 + 1] = v.y;
                velocities[i * 3 + 2] = v.z;

                spins[i * 3 + 0] = (Math.random() - 0.5) * 3.0;       // spin around x/y/z
                spins[i * 3 + 1] = (Math.random() - 0.5) * 3.0;
                spins[i * 3 + 2] = (Math.random() - 0.5) * 3.0;

                // warm yellow/white-ish sparkle colors
                const c = new THREE.Color().lerpColors(CTA, new THREE.Color(0xffffff), Math.random() * 0.35);
                colors.array[i * 3 + 0] = c.r;
                colors.array[i * 3 + 1] = c.g;
                colors.array[i * 3 + 2] = c.b;

                i++;
            }
        }
    }
    voxels.geometry.setAttribute('instColor', colors);

    // --- 3) Starfield (background, drifts after explosion) ----------------
    const STARS = 100;
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
    stars.visible = false;             // reveal after boom
    scene.add(stars);
    // ---- light/dark theme adaptation (safe to add here) --------------------
    const isLight = () =>
        document.documentElement.getAttribute('data-theme') === 'light';

    // edge opacity baseline; we’ll use this in the loop
    let baseEdgeOpacity = 0.55;

    function applyTheme() {
        const light = isLight();

        // solid cube & edges
        heroMat.color.set(light ? '#8a8f98' : ACCENT2.clone().lerp(CTA, 0.18));
        edges.material.color.set(light ? '#1a1a1a' : ACCENT);
        baseEdgeOpacity = light ? 0.80 : 0.55;     // darker edge on light theme

        // starfield (dark dots on light theme)
        starMat.color.set(light ? '#1a1a1a' : 0xffffff);
        starMat.opacity = light ? 0.28 : 0.35;

        // camera a touch farther to keep lines crisp on white
        camera.position.z = light ? 12.5 : 12;
    }

    // run once and update when data-theme changes
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
    }

    // --- 5) Update loop ---------------------------------------------------
    const m = new THREE.Matrix4();
    const euler = new THREE.Euler();
    const tmp = new THREE.Vector3();

    // simple easing
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    let tPrev = performance.now();
    let raf = 0;
    function animate(tNow) {
        const dt = Math.min(50, tNow - tPrev) / 1000;
        tPrev = tNow;

        // idle: rotate cube gently
        if (!shattered) {
            hero.rotation.x += 0.20 * dt;
            hero.rotation.y += 0.12 * dt;
            edges.rotation.copy(hero.rotation);
        } else {
            // fade out hero quickly
            heroOpacity = Math.max(0, heroOpacity - dt * 2.2);
            heroMat.opacity = heroOpacity;
            edges.material.opacity = heroOpacity * 0.55;

            // simulate fragments: outward + slight gravity + drag
            const since = (tNow - boomTime) / 1000;
            const accel = 2.2;            // pushes them outward a bit more
            const drag = 0.985;

            let idx = 0;
            for (let n = 0; n < COUNT; n++) {
                // position = origin + offsets + velocities * time
                const vx = velocities[idx + 0] *= drag;
                const vy = (velocities[idx + 1] -= dt * 0.6) * drag; // gravity
                const vz = velocities[idx + 2] *= drag;

                // add a tiny acceleration away from center
                tmp.set(offsets[idx + 0], offsets[idx + 1], offsets[idx + 2]).normalize().multiplyScalar(accel * dt);
                velocities[idx + 0] += tmp.x;
                velocities[idx + 1] += tmp.y;
                velocities[idx + 2] += tmp.z;

                // cumulatively displace from initial offset
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

            // brighten stars, move them slowly “towards” the camera
            const starOp = easeOutCubic(Math.min(1, since / 1.2)) * 0.55;
            starMat.opacity = 0.15 + starOp;
            stars.rotation.y -= dt * 0.03;
            stars.position.z += dt * 2.0;
        }

        // subtle background grid-like feel by rotating whole scene very slightly
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
