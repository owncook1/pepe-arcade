import { useEffect, useRef } from "preact/hooks";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ----- Adjust these to match your file -----
const MODEL_URL = "/Character Animated.glb"; // path under your Fresh `static/` folder
const MODEL_SCALE = 1; // tweak if the model is too big/small once it loads
const MODEL_ROTATION_Y = 0; // set to Math.PI if the model faces the camera instead of away

export default function PepeWorld() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ----- Scene / Camera / Renderer -----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 150);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 6, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // ----- Lights -----
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(25, 35, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbde0fe, 0x4caf50, 0.8));

    // ----- Ground -----
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x5cb85c, flatShading: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ----- Low-poly prop builders -----
    function addTree(x: number, z: number) {
      const scale = 0.8 + Math.random() * 0.5;
      const group = new THREE.Group();

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.25, 2, 6),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true }),
      );
      trunk.position.y = 1;
      trunk.castShadow = true;

      const leafColor = new THREE.Color().setHSL(
        0.33 + (Math.random() - 0.5) * 0.06,
        0.55,
        0.3 + Math.random() * 0.12,
      );
      const leaves = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.1, 0),
        new THREE.MeshStandardMaterial({ color: leafColor, flatShading: true }),
      );
      leaves.position.y = 2.6;
      leaves.scale.y = 1.2;
      leaves.castShadow = true;

      group.add(trunk, leaves);
      group.position.set(x, 0, z);
      group.scale.setScalar(scale);
      scene.add(group);
      return group;
    }

    function addRock(x: number, z: number) {
      const scale = 0.4 + Math.random() * 0.8;
      const gray = 0.45 + Math.random() * 0.25;
      const rock = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(gray, gray, gray * 0.95),
          flatShading: true,
        }),
      );
      rock.position.set(x, scale * 0.5, z);
      rock.scale.setScalar(scale);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
      return rock;
    }

    function addBench(x: number, z: number, rotationY = 0) {
      const wood = new THREE.MeshStandardMaterial({
        color: 0x9c6b3e,
        flatShading: true,
      });
      const group = new THREE.Group();

      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), wood);
      seat.position.y = 0.5;

      const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), wood);
      back.position.set(0, 0.75, -0.22);

      const legGeo = new THREE.BoxGeometry(0.1, 0.5, 0.45);
      for (const lx of [-0.65, 0.65]) {
        const leg = new THREE.Mesh(legGeo, wood);
        leg.position.set(lx, 0.25, 0);
        group.add(leg);
      }

      group.add(seat, back);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      group.position.set(x, 0, z);
      group.rotation.y = rotationY;
      scene.add(group);
      return group;
    }

    function addRoad(x: number, z: number, w: number, l: number, headingY = 0) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(w, l),
        new THREE.MeshStandardMaterial({ color: 0x6b6b6b, flatShading: true }),
      );
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;

      const group = new THREE.Group();
      group.add(road);
      group.position.set(x, 0.02, z);
      group.rotation.y = headingY;
      scene.add(group);
      return group;
    }

    function addBuilding(
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      wallColor: number,
      roofColor: number,
    ) {
      const group = new THREE.Group();

      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: wallColor, flatShading: true }),
      );
      walls.position.y = h / 2;
      walls.castShadow = true;
      walls.receiveShadow = true;

      const roofHeight = h * 0.6;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.75, roofHeight, 4),
        new THREE.MeshStandardMaterial({ color: roofColor, flatShading: true }),
      );
      roof.position.y = h + roofHeight / 2;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;

      group.add(walls, roof);
      group.position.set(x, 0, z);
      scene.add(group);
      return group;
    }

    function addPond(x: number, z: number, radius: number) {
      const water = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 24),
        new THREE.MeshStandardMaterial({
          color: 0x3a8fd9,
          flatShading: true,
          transparent: true,
          opacity: 0.9,
        }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, 0.03, z);
      scene.add(water);

      const rimCount = 14;
      for (let i = 0; i < rimCount; i++) {
        const angle = (i / rimCount) * Math.PI * 2;
        addRock(
          x + Math.cos(angle) * (radius + 0.6),
          z + Math.sin(angle) * (radius + 0.6),
        );
      }
    }

    // ----- Lay out the world -----
    addPond(-14, -10, 4);

    addRoad(0, 0, 3, 80, 0); // north-south road
    addRoad(0, 20, 80, 3, 0); // cross street

    addBuilding(-8, 18, 5, 5, 3, 0xf2d9a0, 0xb5402c);
    addBuilding(8, 18, 6, 4, 3.5, 0xeaeaea, 0x3a6ea5);
    addBuilding(-8, 24, 4, 4, 2.5, 0xf6c177, 0x6b4226);
    addBuilding(8, 24, 5, 5, 3, 0xd9b08c, 0x4a4a4a);

    addBench(-10, -6, Math.PI / 4);
    addBench(-18, -7, -Math.PI / 5);

    for (let i = 0; i < 45; i++) {
      const x = (Math.random() - 0.5) * 220;
      const z = (Math.random() - 0.5) * 220;
      if (Math.hypot(x, z) < 12) continue;
      addTree(x, z);
    }
    for (let i = 0; i < 55; i++) {
      const x = (Math.random() - 0.5) * 220;
      const z = (Math.random() - 0.5) * 220;
      if (Math.hypot(x, z) < 8) continue;
      addRock(x, z);
    }

    // ----- Character (loaded from your animated glb) -----
    // `character` is the thing the camera follows; it stays in the scene
    // immediately so movement/camera code never has to null-check it.
    // The actual visible mesh is swapped in once the glb finishes loading.
    const character = new THREE.Group();
    scene.add(character);

    const placeholder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x4cd137, flatShading: true }),
    );
    placeholder.position.y = 0.6;
    placeholder.castShadow = true;
    character.add(placeholder);

    let mixer: THREE.AnimationMixer | null = null;
    let activeAction: THREE.AnimationAction | null = null;
    let idleAction: THREE.AnimationAction | null = null;
    let walkAction: THREE.AnimationAction | null = null;
    let runAction: THREE.AnimationAction | null = null;

    function playAction(next: THREE.AnimationAction | null, fade = 0.25) {
      if (!next || next === activeAction) return;
      next.reset().fadeIn(fade).play();
      activeAction?.fadeOut(fade);
      activeAction = next;
    }

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        character.remove(placeholder);

        const model = gltf.scene;
        model.scale.setScalar(MODEL_SCALE);
        model.rotation.y = MODEL_ROTATION_Y;
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        character.add(model);

        mixer = new THREE.AnimationMixer(model);
        const actions: Record<string, THREE.AnimationAction> = {};
        for (const clip of gltf.animations) {
          actions[clip.name] = mixer.clipAction(clip);
        }

        const findClip = (...keywords: string[]) =>
          Object.keys(actions).find((name) =>
            keywords.some((k) => name.toLowerCase().includes(k)),
          );

        const allNames = Object.keys(actions);
        const idleName = findClip("idle");
        const walkName = findClip("walk");
        const runName = findClip("run", "sprint");

        idleAction =
          (idleName && actions[idleName]) ||
          (allNames[0] && actions[allNames[0]]) ||
          null;
        walkAction = (walkName && actions[walkName]) || idleAction;
        runAction = (runName && actions[runName]) || walkAction;

        playAction(idleAction, 0);

        // Open the browser console to see exactly what clips were found —
        // handy if you want to wire up extra ones (jump, wave, etc).
        console.log("PepeWorld: loaded animation clips:", allNames);
      },
      undefined,
      (err) => console.error("PepeWorld: failed to load", MODEL_URL, err),
    );

    // ----- Controls -----
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ----- Animation loop -----
    let frameId = 0;
    const clock = new THREE.Clock();
    const moveDir = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();

    function animate() {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);

      const isRunning = keys["shift"];
      const speed = isRunning ? 0.22 : 0.12;

      moveDir.set(0, 0, 0);
      if (keys["w"] || keys["arrowup"]) moveDir.z -= 1;
      if (keys["s"] || keys["arrowdown"]) moveDir.z += 1;
      if (keys["a"] || keys["arrowleft"]) moveDir.x -= 1;
      if (keys["d"] || keys["arrowright"]) moveDir.x += 1;

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        character.position.x += moveDir.x * speed;
        character.position.z += moveDir.z * speed;

        const targetAngle = Math.atan2(-moveDir.x, -moveDir.z);
        let angleDelta = targetAngle - character.rotation.y;
        angleDelta = Math.atan2(Math.sin(angleDelta), Math.cos(angleDelta));
        character.rotation.y += angleDelta * 0.2;

        playAction(isRunning ? runAction : walkAction);
      } else {
        playAction(idleAction);
      }

      cameraTarget.set(character.position.x, 6, character.position.z + 9);
      camera.position.lerp(cameraTarget, 0.08);
      camera.lookAt(
        character.position.x,
        character.position.y + 0.8,
        character.position.z,
      );

      renderer.render(scene, camera);
    }
    animate();

    // ----- Cleanup -----
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      mixer?.stopAllAction();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "block",
      }}
    />
  );
}
