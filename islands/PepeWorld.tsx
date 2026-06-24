import { useEffect, useRef } from "preact/hooks";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ----- Adjust these to match your file -----
const MODEL_URL = "/Astronaut.glb"; // path under your Fresh `static/` folder
const MODEL_SCALE = 1; // tweak if the model is too big/small once it loads
const MODEL_ROTATION_Y = 0; // set to Math.PI if the model faces the camera instead of away

// =====================================================================
// DATA-DRIVEN WORLD SYSTEM
// =====================================================================
// Every static prop in the world (tree, rock, bench, road, building,
// pond, future Poly Pizza model...) is described as a plain WorldObject.
// A single registry of "builder" functions knows how to turn one
// WorldObject into a THREE.Object3D. The scene-setup code below just
// loops over a `world: WorldObject[]` array and calls the right builder.
//
// Why this shape:
// - Plain data (no functions, no THREE objects) -> JSON.stringify(world)
//   just works, so saving/loading a layout is trivial later.
// - x/y/z/rotation/scale are generic and live at the top level so an
//   editor UI can show one universal "transform" panel for any object.
// - Anything type-specific (building dimensions, road width, rock
//   color, a Poly Pizza model URL...) goes in `params`, kept loose
//   on purpose so new object types don't require touching this type.
// - To add a new prop type later: add it to the `type` union, write a
//   build function with the same signature, register it in `builders`.
// =====================================================================

type WorldObjectType =
  | "tree"
  | "rock"
  | "bench"
  | "road"
  | "building"
  | "pond"
  | "model"; // placeholder for future Poly Pizza .glb props

interface WorldObject {
  id: string;
  type: WorldObjectType;
  x: number;
  z: number;
  y?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scale?: number;
  // Forces this object to draw over everything behind it, ignoring
  // normal depth testing. Use for flat ground-level things (ponds,
  // road decals) that keep getting hidden by the ground/another flat
  // surface at a similar height - not for regular props, since it'll
  // draw through buildings/trees in front of it too.
  renderOnTop?: boolean;
  // Type-specific extras (building width/height, road length, rock
  // color, model url, etc). Deliberately untyped so new object types
  // don't require editing this interface.
  params?: Record<string, any>;
}

type BuilderFn = (obj: WorldObject) => THREE.Object3D;

// Each builder only cares about what the object LOOKS like (geometry,
// materials, internal layout). Position/rotation/scale are applied
// generically once, after the builder returns - see `instantiate()`.

function buildTree(obj: WorldObject): THREE.Object3D {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.25, 2, 6),
    new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true }),
  );
  trunk.position.y = 1;
  trunk.castShadow = true;

  const leaves = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 0),
    new THREE.MeshStandardMaterial({
      color: obj.params?.leafColor ?? 0x4caf50,
      flatShading: true,
    }),
  );
  leaves.position.y = 2.6;
  leaves.scale.y = 1.2;
  leaves.castShadow = true;

  group.add(trunk, leaves);
  return group;
}

function buildRock(obj: WorldObject): THREE.Object3D {
  const gray = obj.params?.gray ?? 0.55;
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(gray, gray, gray * 0.95),
      flatShading: true,
    }),
  );
  rock.castShadow = true;
  rock.receiveShadow = true;
  return rock;
}

function buildBench(obj: WorldObject): THREE.Object3D {
  const wood = new THREE.MeshStandardMaterial({
    color: obj.params?.woodColor ?? 0x9c6b3e,
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
  return group;
}

function buildRoad(obj: WorldObject): THREE.Object3D {
  const width = obj.params?.width ?? 3;
  const length = obj.params?.length ?? 80;

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshStandardMaterial({
      color: obj.params?.color ?? 0x6b6b6b,
      flatShading: true,
    }),
  );
  road.rotation.x = -Math.PI / 2; // lay flat - intrinsic to "being a road"
  road.position.y = 0.02; // sit a hair above the ground plane to avoid z-fighting
  road.receiveShadow = true;

  const group = new THREE.Group();
  group.add(road);
  return group;
}

function buildBuilding(obj: WorldObject): THREE.Object3D {
  const width = obj.params?.width ?? 5;
  const depth = obj.params?.depth ?? 5;
  const height = obj.params?.height ?? 3;
  const wallColor = obj.params?.wallColor ?? 0xeeeeee;
  const roofColor = obj.params?.roofColor ?? 0x884433;

  const group = new THREE.Group();

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color: wallColor, flatShading: true }),
  );
  walls.position.y = height / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;

  const roofHeight = height * 0.6;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.75, roofHeight, 4),
    new THREE.MeshStandardMaterial({ color: roofColor, flatShading: true }),
  );
  roof.position.y = height + roofHeight / 2;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  group.add(walls, roof);
  return group;
}

function buildPond(obj: WorldObject): THREE.Object3D {
  const radius = obj.params?.radius ?? 4;

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 24),
    new THREE.MeshStandardMaterial({
      color: obj.params?.color ?? 0x3a8fd9,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.03; // sit a hair above the ground plane to avoid z-fighting

  const group = new THREE.Group();
  group.add(water);
  return group;
}

// ----- Future: Poly Pizza (or any) .glb props -----
// Loads are async, so `buildModel` returns an empty group immediately
// (instantiate() positions/scales THAT group) and swaps the real mesh
// in once the file is ready - the same trick used for the player
// character lower in this file. Loaded scenes are cached per-url so
// dropping 30 of the same Poly Pizza tree in `world[]` only fetches it
// once and clones the rest.
const modelLoader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Group>>();

function loadModelScene(url: string): Promise<THREE.Group> {
  if (!modelCache.has(url)) {
    modelCache.set(
      url,
      new Promise((resolve, reject) => {
        modelLoader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
      }),
    );
  }
  return modelCache.get(url)!;
}

function buildModel(obj: WorldObject): THREE.Object3D {
  const group = new THREE.Group();
  const url: string | undefined = obj.params?.modelUrl;
  if (!url) {
    console.warn(`PepeWorld: model object "${obj.id}" has no params.modelUrl`);
    return group;
  }

  loadModelScene(url)
    .then((scene) => {
      const instance = scene.clone(true);
      instance.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      group.add(instance);
    })
    .catch((err) =>
      console.error(`PepeWorld: failed to load model ${url}`, err),
    );

  return group;
}

const builders: Record<WorldObjectType, BuilderFn> = {
  tree: buildTree,
  rock: buildRock,
  bench: buildBench,
  road: buildRoad,
  building: buildBuilding,
  pond: buildPond,
  model: buildModel,
};

// Applies the generic transform (shared by every object type) on top
// of whatever the builder produced.
function instantiate(obj: WorldObject): THREE.Object3D {
  const build = builders[obj.type];
  if (!build) {
    console.warn(`PepeWorld: unknown world object type "${obj.type}"`);
    return new THREE.Group();
  }
  const object3d = build(obj);
  object3d.position.set(obj.x, obj.y ?? 0, obj.z);
  object3d.rotation.set(
    obj.rotationX ?? 0,
    obj.rotationY ?? 0,
    obj.rotationZ ?? 0,
  );
  object3d.scale.setScalar(obj.scale ?? 1);

  if (obj.renderOnTop) {
    object3d.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.renderOrder = 999;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.depthTest = false;
        });
      }
    });
  }

  return object3d;
}

// ----- World layout -----
// Pure data: a curated layout (pond, roads, buildings, benches) plus
// procedurally scattered trees/rocks. Randomness is rolled HERE, once,
// and baked into the WorldObject (e.g. each tree's leaf color, each
// rock's gray value/tilt) so the resulting array is fully serializable
// and reproducible - exactly what a "save my world" or "load my world"
// button needs later.
function createWorld(): WorldObject[] {
  const world: WorldObject[] = [];
  let nextId = 0;
  const add = (entry: Omit<WorldObject, "id">) => {
    world.push({ id: `obj_${nextId++}`, ...entry });
  };

  // Pond + its ring of rim rocks
  const pondX = -14;
  const pondZ = -10;
  const pondRadius = 4;
  add({ type: "pond", x: pondX, z: pondZ, params: { radius: pondRadius } });

  const rimCount = 14;
  for (let i = 0; i < rimCount; i++) {
    const angle = (i / rimCount) * Math.PI * 2;
    const scale = 0.4 + Math.random() * 0.8;
    add({
      type: "rock",
      x: pondX + Math.cos(angle) * (pondRadius + 0.6),
      z: pondZ + Math.sin(angle) * (pondRadius + 0.6),
      y: scale * 0.5,
      scale,
      rotationX: Math.random() * Math.PI,
      rotationY: Math.random() * Math.PI,
      params: { gray: 0.45 + Math.random() * 0.25 },
    });
  }

  // Roads
  add({ type: "road", x: 0, z: 0, params: { width: 3, length: 80 } }); // north-south
  add({ type: "road", x: 0, z: 20, params: { width: 80, length: 3 } }); // cross street

  // Buildings
  add({
    type: "building",
    x: -8,
    z: 18,
    params: {
      width: 5,
      depth: 5,
      height: 3,
      wallColor: 0xf2d9a0,
      roofColor: 0xb5402c,
    },
  });
  add({
    type: "building",
    x: 8,
    z: 18,
    params: {
      width: 6,
      depth: 4,
      height: 3.5,
      wallColor: 0xeaeaea,
      roofColor: 0x3a6ea5,
    },
  });
  add({
    type: "building",
    x: -8,
    z: 24,
    params: {
      width: 4,
      depth: 4,
      height: 2.5,
      wallColor: 0xf6c177,
      roofColor: 0x6b4226,
    },
  });
  add({
    type: "building",
    x: 8,
    z: 24,
    params: {
      width: 5,
      depth: 5,
      height: 3,
      wallColor: 0xd9b08c,
      roofColor: 0x4a4a4a,
    },
  });

  // Benches
  add({ type: "bench", x: -10, z: -6, rotationY: Math.PI / 4 });
  add({ type: "bench", x: -18, z: -7, rotationY: -Math.PI / 5 });

  // Scattered trees
  for (let i = 0; i < 45; i++) {
    const x = (Math.random() - 0.5) * 220;
    const z = (Math.random() - 0.5) * 220;
    if (Math.hypot(x, z) < 12) continue;
    add({
      type: "tree",
      x,
      z,
      scale: 0.8 + Math.random() * 0.5,
      params: {
        leafColor: new THREE.Color()
          .setHSL(
            0.33 + (Math.random() - 0.5) * 0.06,
            0.55,
            0.3 + Math.random() * 0.12,
          )
          .getHex(),
      },
    });
  }

  // Scattered rocks
  for (let i = 0; i < 55; i++) {
    const x = (Math.random() - 0.5) * 220;
    const z = (Math.random() - 0.5) * 220;
    if (Math.hypot(x, z) < 8) continue;
    const scale = 0.4 + Math.random() * 0.8;
    add({
      type: "rock",
      x,
      z,
      y: scale * 0.5,
      scale,
      rotationX: Math.random() * Math.PI,
      rotationY: Math.random() * Math.PI,
      params: { gray: 0.45 + Math.random() * 0.25 },
    });
  }

  // Poly Pizza props
  // add({
  //   type: "model",
  //   x: 4,
  //   y: -1.25,
  //   z: -4,
  //   scale: 0.1, // tuned live via pepeWorld.update() before baking this in
  //   params: { modelUrl: "/Pond.glb" },
  // });
  add({
    type: "model",
    x: 6,
    y: 1.5,
    z: -4, // placeholder - pick wherever you want it to stand
    scale: 2, // unknown yet - tune live first, see note below
    params: { modelUrl: "My Neighbor.glb" },
  });
  add({
    type: "model",
    x: -6,
    y: 0.5,
    z: -4, // placeholder - pick wherever you want it to stand
    scale: 2, // unknown yet - tune live first, see note below
    params: { modelUrl: "Octopus.glb" },
  });

  return world;
}

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

    // ----- World: one array, one loop -----
    const world: WorldObject[] = createWorld();
    const sceneObjects = new Map<string, THREE.Object3D>();

    for (const entry of world) {
      const object3d = instantiate(entry);
      scene.add(object3d);
      sceneObjects.set(entry.id, object3d);
    }

    // Lets you add/remove props at runtime later (e.g. from a UI editor)
    // without re-running the whole setup. Kept as plain functions here;
    // wire them to a ref or expose on window once an editor exists.
    function addWorldObject(entry: Omit<WorldObject, "id">): string {
      const id = `obj_${world.length}_${Date.now()}`;
      const fullEntry: WorldObject = { id, ...entry };
      const object3d = instantiate(fullEntry);
      scene.add(object3d);
      sceneObjects.set(id, object3d);
      world.push(fullEntry);
      return id;
    }

    function removeWorldObject(id: string) {
      const object3d = sceneObjects.get(id);
      if (!object3d) return;
      scene.remove(object3d);
      object3d.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      sceneObjects.delete(id);
      const idx = world.findIndex((e) => e.id === id);
      if (idx !== -1) world.splice(idx, 1);
    }

    // Tweak an existing object in place (scale, position, rotation, or
    // params like modelUrl) without retyping the whole entry. Rebuilds
    // it under the hood, so this is the fast way to dial in a model's
    // scale: pepeWorld.update(id, { scale: 0.1 }), look, repeat.
    function updateWorldObject(
      id: string,
      changes: Partial<Omit<WorldObject, "id">>,
    ) {
      const idx = world.findIndex((e) => e.id === id);
      if (idx === -1) {
        console.warn(`PepeWorld: no object with id "${id}"`);
        return;
      }
      const updated: WorldObject = { ...world[idx], ...changes, id };

      const old = sceneObjects.get(id);
      if (old) {
        scene.remove(old);
        old.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => m.dispose());
          }
        });
      }

      const object3d = instantiate(updated);
      scene.add(object3d);
      sceneObjects.set(id, object3d);
      world[idx] = updated;
    }

    // Handy escape hatch for poking at the world from the browser console
    // while building an editor UI: window.pepeWorld.world, .add(), .remove(), .update()
    (window as any).pepeWorld = {
      world,
      add: addWorldObject,
      remove: removeWorldObject,
      update: updateWorldObject,
    };

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
        model.rotation.y = Math.PI;
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

    // Mouse look: orbits the camera around the character independently
    // of WASD movement. Click the canvas to lock the pointer (the usual
    // browser pattern for this), then moving the mouse left/right
    // changes `yaw` (which side you're viewing from) and up/down
    // changes `pitch` (how high above the character the camera sits).
    let yaw = 0; // 0 = directly behind the character, same as the old fixed camera
    let pitch = 0.588; // ~33.7deg, matches the original (0, 6, 9) offset
    const lookSensitivity = 0.0025;
    const minPitch = 0.15; // keep the camera from dipping into the ground
    const maxPitch = 1.45; // keep it from flipping over the top

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= e.movementX * lookSensitivity;
      pitch -= e.movementY * lookSensitivity;
      pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    };
    const onCanvasClick = () => {
      renderer.domElement.requestPointerLock();
    };
    document.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onCanvasClick);

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
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

      moveDir.set(0, 0, 0);

      if (keys["w"] || keys["arrowup"]) moveDir.add(forward);
      if (keys["s"] || keys["arrowdown"]) moveDir.sub(forward);
      if (keys["a"] || keys["arrowleft"]) moveDir.sub(right);
      if (keys["d"] || keys["arrowright"]) moveDir.add(right);
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

      const orbitRadius = 10.82; // distance from character, matches the original framing
      const offsetX = orbitRadius * Math.cos(pitch) * Math.sin(yaw);
      const offsetY = orbitRadius * Math.sin(pitch);
      const offsetZ = orbitRadius * Math.cos(pitch) * Math.cos(yaw);

      cameraTarget.set(
        character.position.x + offsetX,
        offsetY,
        character.position.z + offsetZ,
      );
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
      document.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onCanvasClick);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      mixer?.stopAllAction();
      delete (window as any).pepeWorld;

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
