import * as THREE from "three";
import { DAY_CYCLE_SECONDS } from "../Constants";
import { smoothstep } from "../utils/MathUtils";

export interface RenderMaterials {
  solid: THREE.Material;
  cutout: THREE.Material;
  water: THREE.Material;
}

/**
 * Owns the WebGL renderer, camera, scene lighting and sky. Handles the
 * optional day/night cycle: the sun orbits the world, light intensities
 * and sky/fog colors are lerped between night, dawn and day states.
 */
export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  materials!: RenderMaterials;

  cycleOn = true;
  timeOfDay = 0.27; // start just after sunrise

  private sun: THREE.DirectionalLight;
  private sunTarget = new THREE.Object3D();
  private hemi: THREE.HemisphereLight;
  private amb: THREE.AmbientLight;
  private sunMesh: THREE.Mesh;
  private fog: THREE.Fog;
  private sunColor = new THREE.Color();
  private skyColor = new THREE.Color();
  private skyDay = new THREE.Color(0x87ceeb);
  private skyNight = new THREE.Color(0x0d1226);
  private skyDawn = new THREE.Color(0xff9d4d);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

    this.scene.background = new THREE.Color(0x87ceeb);
    this.fog = new THREE.Fog(0x87ceeb, 70, 210);
    this.scene.fog = this.fog;

    this.sun = new THREE.DirectionalLight(0xfff3d6, 1.3);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun, this.sunTarget);

    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x5c5c50, 0.9);
    this.amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.hemi, this.amb);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(14, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff6cf, fog: false })
    );
    this.sunMesh.renderOrder = -1;
    this.scene.add(this.sunMesh);
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
      }),
    };
  }

  toggleCycle(): void {
    this.cycleOn = !this.cycleOn;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    if (this.cycleOn) {
      this.timeOfDay = (this.timeOfDay + dt / DAY_CYCLE_SECONDS) % 1;
    }

    const ang = this.timeOfDay * Math.PI * 2;
    const sunH = Math.sin(ang);
    const dayF = smoothstep(-0.15, 0.35, sunH);
    const dawnF = Math.max(0, 1 - Math.abs(sunH) / 0.3);

    this.skyColor.copy(this.skyNight).lerp(this.skyDay, dayF);
    this.skyColor.lerp(this.skyDawn, dawnF * 0.5);
    (this.scene.background as THREE.Color).copy(this.skyColor);
    this.fog.color.copy(this.skyColor);

    const sunDir = new THREE.Vector3(Math.cos(ang), sunH, 0.35).normalize();
    this.sun.position.copy(playerPos).addScaledVector(sunDir, 300);
    this.sunTarget.position.copy(playerPos);

    this.sun.intensity = 0.06 + Math.max(sunH, 0) * 1.4;
    this.hemi.intensity = 0.18 + dayF * 0.8;
    this.amb.intensity = 0.15 + dayF * 0.3;
    this.sunColor.set(0xfff3d6).lerp(new THREE.Color(0xff9d4d), dawnF * 0.6);
    this.sun.color.copy(this.sunColor);

    this.sunMesh.position.copy(this.sun.position);
    this.sunMesh.visible = sunH > -0.08;
    (this.sunMesh.material as THREE.MeshBasicMaterial).color.copy(this.sunColor);
  }

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
