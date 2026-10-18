import "./style.css";
import { Game } from "./core/Game";
import { HUD } from "./ui/HUD";

/** Required DOM element ids. Missing any of these is a fatal startup error. */
const REQUIRED_IDS = [
  "game",
  "fps",
  "pos",
  "chunks",
  "cycle",
  "clickToPlay",
  "loading",
  "loadbarfill",
  "loadtext",
  "hotbar",
  "held",
  "debug",
  "fatal",
];

function getRequired(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Required DOM element "#${id}" is missing.`);
  return node;
}

function boot(): void {
  for (const id of REQUIRED_IDS) getRequired(id);

  const canvas = getRequired("game") as HTMLCanvasElement;
  const hud = new HUD();
  const game = new Game(canvas, hud);
  game.start();

  // Test hook for automated validation.
  // SAFETY: Window has no __mc in the DOM lib; the e2e suite reads this exact field.
  (window as unknown as { __mc: Game }).__mc = game;
}

try {
  boot();
} catch (err) {
  // Surface unrecoverable initialization failures (e.g. WebGL unavailable,
  // missing DOM) instead of crashing silently.
  console.error("[trymc] failed to initialize:", err);
  const message = err instanceof Error ? err.message : String(err);
  const fatal = document.getElementById("fatal");
  if (fatal) {
    fatal.classList.remove("hidden");
    const clickToPlay = document.getElementById("clickToPlay");
    if (clickToPlay) clickToPlay.classList.add("hidden");
    const loading = document.getElementById("loading");
    if (loading) loading.classList.add("hidden");
    const pre = document.createElement("pre");
    pre.textContent = `Failed to initialize TryMC:\n${message}`;
    fatal.appendChild(pre);
  } else {
    alert(`Failed to initialize TryMC:\n${message}`);
  }
}