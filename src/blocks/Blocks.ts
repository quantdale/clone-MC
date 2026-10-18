export enum Block {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Water = 5,
  Bedrock = 6,
  Log = 7,
  Leaves = 8,
  Brick = 9,
  TallGrass = 10,
  Flower = 11,
  Snow = 12,
}

export enum Tex {
  GrassTop = 0,
  GrassSide = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Water = 5,
  Bedrock = 6,
  LogSide = 7,
  LogTop = 8,
  Leaves = 9,
  Brick = 10,
  TallGrass = 11,
  Flower = 12,
  Snow = 13,
}

export interface BlockDef {
  id: Block;
  name: string;
  /** Blocks movement. */
  solid: boolean;
  /** Fully occludes neighboring faces (used for face culling). */
  opaque: boolean;
  /** Can the player remove it with left-click? */
  breakable: boolean;
  /** Textures per face: top, bottom, +x, -x, +z, -z. */
  textures: readonly [Tex, Tex, Tex, Tex, Tex, Tex];
}

function all(t: Tex): readonly [Tex, Tex, Tex, Tex, Tex, Tex] {
  return [t, t, t, t, t, t];
}

export const BLOCKS: Record<number, BlockDef> = {
  [Block.Grass]: {
    id: Block.Grass,
    name: "Grass",
    solid: true,
    opaque: true,
    breakable: true,
    textures: [Tex.GrassTop, Tex.Dirt, Tex.GrassSide, Tex.GrassSide, Tex.GrassSide, Tex.GrassSide],
  },
  [Block.Dirt]: { id: Block.Dirt, name: "Dirt", solid: true, opaque: true, breakable: true, textures: all(Tex.Dirt) },
  [Block.Stone]: { id: Block.Stone, name: "Stone", solid: true, opaque: true, breakable: true, textures: all(Tex.Stone) },
  [Block.Sand]: { id: Block.Sand, name: "Sand", solid: true, opaque: true, breakable: true, textures: all(Tex.Sand) },
  [Block.Water]: { id: Block.Water, name: "Water", solid: false, opaque: false, breakable: true, textures: all(Tex.Water) },
  [Block.Bedrock]: { id: Block.Bedrock, name: "Bedrock", solid: true, opaque: true, breakable: false, textures: all(Tex.Bedrock) },
  [Block.Log]: {
    id: Block.Log,
    name: "Log",
    solid: true,
    opaque: true,
    breakable: true,
    textures: [Tex.LogTop, Tex.LogTop, Tex.LogSide, Tex.LogSide, Tex.LogSide, Tex.LogSide],
  },
  [Block.Leaves]: { id: Block.Leaves, name: "Leaves", solid: true, opaque: false, breakable: true, textures: all(Tex.Leaves) },
  [Block.Brick]: { id: Block.Brick, name: "Brick", solid: true, opaque: true, breakable: true, textures: all(Tex.Brick) },
  [Block.TallGrass]: {
    id: Block.TallGrass,
    name: "Tall Grass",
    solid: false,
    opaque: false,
    breakable: true,
    textures: all(Tex.TallGrass),
  },
  [Block.Flower]: {
    id: Block.Flower,
    name: "Flower",
    solid: false,
    opaque: false,
    breakable: true,
    textures: all(Tex.Flower),
  },
  [Block.Snow]: { id: Block.Snow, name: "Snow", solid: true, opaque: true, breakable: true, textures: all(Tex.Snow) },
};

export const HOTBAR: readonly Block[] = [
  Block.Grass,
  Block.Dirt,
  Block.Stone,
  Block.Sand,
  Block.Log,
  Block.Leaves,
  Block.Water,
  Block.Bedrock,
  Block.Brick,
];

export function blocksMovement(id: number): boolean {
  return BLOCKS[id]?.solid === true;
}

export function isSolid(id: number): boolean {
  return blocksMovement(id);
}
