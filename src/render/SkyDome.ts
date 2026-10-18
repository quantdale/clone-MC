import * as THREE from "three";

/**
 * Gradient sky dome: zenith/horizon colors, a sun halo, moon, stars and
 * slow clouds. Follows the camera so the background is never a flat fill.
 * Fog is disabled on the material; the renderer matches fog to the horizon
 * so terrain fades into the sky instead of a gray wall.
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    uZenith: { value: THREE.Color };
    uHorizon: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uTime: { value: number };
    uNight: { value: number };
    uDay: { value: number };
  };

  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color(0x4aa3e8) },
      uHorizon: { value: new THREE.Color(0xc5e6ff) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff3d0) },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uDay: { value: 1 },
    };
    const geo = new THREE.SphereGeometry(420, 32, 20);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uTime;
        uniform float uNight;
        uniform float uDay;
        varying vec3 vDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = p * 2.02 + vec2(1.7, 9.2);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 rd = normalize(vDir);
          float h = clamp(rd.y, 0.0, 1.0);
          float curve = pow(h, 0.62);
          vec3 col = mix(uHorizon, uZenith, curve);

          vec3 sun = normalize(uSunDir);
          float sunDot = dot(rd, sun);
          float glow = pow(max(sunDot, 0.0), 8.0);
          col += uSunColor * glow * 0.55 * uDay;
          float disc = smoothstep(0.9992, 0.9997, sunDot);
          col = mix(col, uSunColor, disc * uDay);

          vec3 moonDir = normalize(vec3(-sun.x, -sun.y, -sun.z));
          float moonDot = dot(rd, moonDir);
          float moon = smoothstep(0.9994, 0.99975, moonDot);
          col = mix(col, vec3(0.85, 0.88, 0.95), moon * uNight);

          if (uNight > 0.15 && rd.y > 0.02) {
            vec2 sp = rd.xz / max(rd.y, 0.05);
            float star = step(0.9975, hash(floor(sp * 90.0)));
            star *= smoothstep(0.02, 0.2, rd.y);
            col += vec3(0.9, 0.95, 1.0) * star * uNight;
          }

          if (rd.y > 0.02) {
            vec2 cp = rd.xz / max(rd.y, 0.08) * 0.55;
            cp.x += uTime * 0.012;
            float cl = fbm(cp);
            float clouds = smoothstep(0.52, 0.72, cl) * smoothstep(0.02, 0.18, rd.y);
            clouds *= 0.55 * (0.35 + 0.65 * uDay);
            vec3 cloudCol = mix(vec3(0.25, 0.28, 0.38), vec3(1.0, 1.0, 1.0), uDay);
            col = mix(col, cloudCol, clouds);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
    this.mesh.matrixAutoUpdate = true;
  }

  update(
    playerPos: THREE.Vector3,
    zenith: THREE.Color,
    horizon: THREE.Color,
    sunDir: THREE.Vector3,
    sunColor: THREE.Color,
    time: number,
    night: number,
    day: number
  ): void {
    this.mesh.position.copy(playerPos);
    this.uniforms.uZenith.value.copy(zenith);
    this.uniforms.uHorizon.value.copy(horizon);
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uTime.value = time;
    this.uniforms.uNight.value = night;
    this.uniforms.uDay.value = day;
  }
}
