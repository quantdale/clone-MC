import type * as THREE from "three";
import { ATLAS_CELL, ATLAS_COLS, ATLAS_H, ATLAS_PAD, ATLAS_TILE, ATLAS_W } from "../blocks/TextureAtlas";
import { Tex } from "../blocks/Blocks";

/**
 * Greedy quads are larger than one block, but the atlas stores each tile
 * once. Sampling those quads with stretched UVs walks into neighboring
 * tiles and empty canvas — the checkerboard corruption in-game.
 *
 * This hook keeps MeshLambertMaterial (scene lights, fog, alphaTest) and
 * replaces the map sample with a per-block tile computed from the face
 * position, so merged quads tile correctly.
 */
const SPRITE_LO = Tex.TallGrass;
const SPRITE_HI = Tex.Flower;

const FRAGMENT_SAMPLE = /* glsl */ `
{
  vec3 nAbs = abs(normalize(vObjNormal));
  vec2 faceUV;
  if (nAbs.y >= nAbs.x && nAbs.y >= nAbs.z) {
    faceUV = vLocalPos.xz;
  } else if (nAbs.x >= nAbs.z) {
    faceUV = vec2(vLocalPos.z, vLocalPos.y);
  } else {
    faceUV = vec2(vLocalPos.x, vLocalPos.y);
  }
  float tileId = floor(vTile + 0.5);
  bool sprite = tileId >= ${SPRITE_LO}.0 && tileId <= ${SPRITE_HI}.0;
  if (WAVE > 0.5) {
    faceUV.x += uTime * 0.08;
    faceUV.y += sin(uTime * 0.65 + vLocalPos.x * 0.31 + vLocalPos.z * 0.17) * 0.045;
  }
  vec2 fuv = sprite ? vMapUv : fract(faceUV);
  fuv = clamp(fuv, 1.5 / ${ATLAS_TILE}.0, 1.0 - 1.5 / ${ATLAS_TILE}.0);
  float col = mod(tileId, ${ATLAS_COLS}.0);
  float row = floor(tileId / ${ATLAS_COLS}.0);
  vec2 origin = vec2(col * ${ATLAS_CELL}.0 + ${ATLAS_PAD}.0, row * ${ATLAS_CELL}.0 + ${ATLAS_PAD}.0);
  vec2 canvasPx = origin + vec2(fuv.x, 1.0 - fuv.y) * ${ATLAS_TILE}.0;
  vec2 atlasUV = vec2(canvasPx.x / ${ATLAS_W}.0, 1.0 - canvasPx.y / ${ATLAS_H}.0);
  vec4 sampledDiffuseColor = texture2D(map, atlasUV);
  diffuseColor *= sampledDiffuseColor;
}
`;

export function installVoxelTiling(material: THREE.Material, water: boolean): void {
  const sample = FRAGMENT_SAMPLE.replace("WAVE", water ? "1.0" : "0.0");
  material.customProgramCacheKey = () => (water ? "voxel-tile-water-v1" : "voxel-tile-opaque-v1");
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aTile;
varying float vTile;
varying highp vec3 vLocalPos;
varying vec3 vObjNormal;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vTile = aTile;
vLocalPos = position;
vObjNormal = objectNormal;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vTile;
// highp matters: mediump interpolation makes fract() of block coordinates
// drift across the tile edge and paint stray colours on faces.
varying highp vec3 vLocalPos;
varying vec3 vObjNormal;
uniform float uTime;`
      )
      .replace("#include <map_fragment>", sample);
  };
}

export function tickVoxelTiling(materials: { solid: THREE.Material; cutout: THREE.Material; water: THREE.Material }, time: number): void {
  for (const mat of [materials.solid, materials.cutout, materials.water]) {
    const shader = mat.userData.shader as { uniforms: { uTime?: { value: number } } } | undefined;
    if (shader?.uniforms.uTime) shader.uniforms.uTime.value = time;
  }
}
