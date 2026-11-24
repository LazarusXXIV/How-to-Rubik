import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export class StudioScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private readonly container: HTMLElement;
  private readonly pmremGenerator: THREE.PMREMGenerator;
  private readonly envRT: THREE.WebGLRenderTarget;
  private rafId: number | null = null;
  private lastTime = 0;
  private readonly onResizeBound: () => void;

  constructor(container: HTMLElement) {
    this.container = container;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene.background = new THREE.Color(0xf4f5f7);

    this.camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    this.camera.position.set(6.7, 5.35, 7.35);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.transmissionResolutionScale = 0.75;

    container.appendChild(this.renderer.domElement);

    // Studio environment reflections for crisp glass bevel highlights
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = this.pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.85;
    roomEnv.dispose();

    this.setupLightingAndShadowGround();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 6.0;
    this.controls.maxDistance = 16.5;
    this.controls.target.set(0, -0.15, 0);
    this.controls.update();

    this.onResizeBound = this.handleResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);
  }

  private setupLightingAndShadowGround(): void {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe5e7eb, 0.9);
    hemiLight.position.set(0, 10, 0);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.55);
    keyLight.position.set(-4.5, 9.5, 5.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.camera.left = -4.2;
    keyLight.shadow.camera.right = 4.2;
    keyLight.shadow.camera.top = 4.2;
    keyLight.shadow.camera.bottom = -4.2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 5;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf8fafc, 0.75);
    rimLight.position.set(6.5, 3.5, -5.5);
    this.scene.add(rimLight);

    const shadowPlaneGeo = new THREE.PlaneGeometry(24, 24);
    const shadowPlaneMat = new THREE.ShadowMaterial({
      color: 0x0f172a,
      opacity: 0.085,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.25;
    shadowPlane.receiveShadow = true;
    this.scene.add(shadowPlane);
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  setControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  start(onTick: (dtSeconds: number) => void): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;

      onTick(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  captureScreenshot(): string {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  private handleResize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.onResizeBound);
    this.controls.dispose();
    this.envRT.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();
  }
}
