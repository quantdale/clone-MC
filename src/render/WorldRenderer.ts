import * as THREE from "three";
import { DAY_CYCLE_SECONDS } from "../Constants";
import { smoothstep } from "../utils/MathUtils";
import { SkyDome } from "./SkyDome";
import { installVoxelTiling, tickVoxelTiling } from "./voxelShader";

export interface RenderMaterials {
  solid: THREE.Material;
  cutout: THREE.Material;
  water: THREE.Material;
}

/**
 * Owns the WebGL renderer, camera, scene lighting and sky. The day/night
 * cycle orbits the sun, lerps light and sky colors, and keeps fog matched
 * to the horizon so distant terrain dissolves into the sky instead of a
 * flat gray fill.
 */
export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  materials!: RenderMaterials;

  cycleOn = true;
  timeOfDay = 0.27; // late morning — sun is up, sky is clearly blue

  private sun: THREE.DirectionalLight;
  private sunTarget = new THREE.Object3D();
  private hemi: THREE.HemisphereLight;
  private amb: THREE.AmbientLight;
  private sunMesh: THREE.Mesh;
  private fog: THREE.Fog;
  private sky: SkyDome;
  private elapsed = 0;
  private readonly sunDir = new THREE.Vector3();
  private readonly sunColor = new THREE.Color();
  private readonly skyColor = new THREE.Color();
  private readonly zenith = new THREE.Color();
  private readonly horizon = new THREE.Color();
  private readonly skyDay = new THREE.Color(0x87ceeb);
  private readonly skyNight = new THREE.Color(0x0d1226);
  private readonly skyDawn = new THREE.Color(0xff9d4d);
  private readonly zenithDay = new THREE.Color(0x3d8fd4);
  private readonly zenithNight = new THREE.Color(0x070b18);
  private readonly horizonDay = new THREE.Color(0xc9ebff);
  private readonly horizonNight = new THREE.Color(0x1a2444);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

    this.scene.background = new THREE.Color(0x87ceeb);
    this.fog = new THREE.Fog(0xc9ebff, 58, 128);
    this.scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.3);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun, this.sunTarget);

    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x5c5c50, 0.9);
    this.amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.hemi, this.amb);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(8, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false, depthWrite: false })
    );
    this.sunMesh.renderOrder = -1;
    this.sunMesh.frustumCulled = false;
    this.scene.add(this.sunMesh);

    this.sky = new SkyDome();
    this.scene.add(this.sky.mesh);
  }

  setMaterials(atlas: THREE.Texture): void {
    this.materials = {
      solid: new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({
        map: atlas,
        vertexColors: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
      water: new THREE.MeshLambertMaterial({
        map: atlas,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    };
    installVoxelTiling(this.materials.solid, false);
    installVoxelTiling(this.materials.cutout, false);
    installVoxelTiling(this.materials.water, true);
  }

  toggleCycle(): void {
    this.cycleOn = !this.cycleOn;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.elapsed += dt;
    if (this.cycleOn) {
      this.timeOfDay = (this.timeOfDay + dt / DAY_CYCLE_SECONDS) % 1;
    }

    const ang = this.timeOfDay * Math.PI * 2;
    const sunH = Math.sin(ang);
    const dayF = smoothstep(-0.15, 0.35, sunH);
    const dawnF = Math.max(0, 1 - Math.abs(sunH) / 0.3);
    const nightF = 1 - dayF;

    this.skyColor.copy(this.skyNight).lerp(this.skyDay, dayF);
    this.skyColor.lerp(this.skyDawn, dawnF * 0.55);
    this.zenith.copy(this.zenithNight).lerp(this.zenithDay, dayF);
    this.zenith.lerp(this.skyDawn, dawnF * 0.35);
    this.horizon.copy(this.horizonNight).lerp(this.horizonDay, dayF);
    this.horizon.lerp(this.skyDawn, dawnF * 0.72);

    (this.scene.background as THREE.Color).copy(this.horizon);
    this.fog.color.copy(this.horizon);
    this.fog.near = 52 + dayF * 8;
    this.fog.far = 118 + dayF * 16;

    this.sunDir.set(Math.cos(ang), sunH, 0.35).normalize();
    this.sun.position.copy(playerPos).addScaledVector(this.sunDir, 280);
    this.sunTarget.position.copy(playerPos);

    this.sun.intensity = 0.08 + Math.max(sunH, 0) * 1.35;
    this.hemi.intensity = 0.22 + dayF * 0.72;
    this.amb.intensity = 0.18 + dayF * 0.28;
    this.sunColor.set(0xfff3d6).lerp(this.dawnTint, dawnF * 0.6);
    this.sun.color.copy(this.sunColor);
    this.hemi.color.copy(this.hemiDay).lerp(this.horizon, 0.35);
    this.groundTint.set(0x6a6248).lerp(this.groundNight, nightF);
    this.hemi.groundColor.copy(this.groundTint);

    this.sunMesh.position.copy(playerPos).addScaledVector(this.sunDir, 360);
    this.sunMesh.visible = sunH > -0.08;
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.copy(this.sunColor);

    this.sky.update(playerPos, this.zenith, this.horizon, this.sunDir, this.sunColor, this.elapsed, nightF, dayF);
    if (this.materials) tickVoxelTiling(this.materials, this.elapsed);
  }

  private readonly dawnTint = new THREE.Color(0xff9d4d);
  private readonly hemiDay = new THREE.Color(0xbcd7ff);
  private readonly groundTint = new THREE.Color(0x6a6248);
  private readonly groundNight = new THREE.Color(0x2a3148);

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Triangles drawn in the most recent frame (for diagnostics). */
  triangles(): number {
    return this.renderer.info.render.triangles;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
