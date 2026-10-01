// Joins the frames with the music and the sound effects -> out/cynote.mp4
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ffmpeg = require("ffmpeg-static");
const { FPS } = require("./lib");

// [arquivo, início em segundos, ganho em dB] - each one lands on its moment in anim.js.
const SFX = [
  ["01.mp3", 0.1, -9], // a vinha se desenha
  ["02.mp3", 2.97, 9], // o lampião acende
  ["03.mp3", 13.9, 12], // Ctrl, Shift, Space
  ["04.mp3", 14.88, -5], // a janela surge
  ["05.mp3", 16.0, 0], // as guias de vitral acendem
  ["06.mp3", 17.0, 5], // digitação
  ["07.mp3", 32.48, 22], // a flor de sincronização
  ["08.mp3", 34.6, -4], // o dia vira noite
  ["09.mp3", 40.25, -14], // o medalhão final
];

const dir = __dirname;
fs.mkdirSync(path.join(dir, "out"), { recursive: true });
const args = ["-y", "-framerate", String(FPS), "-i", path.join(dir, "frames", "f%05d.jpg"), "-i", path.join(dir, "audio", "musica.wav")];
SFX.forEach(([file]) => args.push("-i", path.join(dir, "audio", file)));
const filters = SFX.map(([, at, gain], i) => {
  const ms = Math.round(at * 1000);
  return `[${i + 2}:a]aresample=48000,volume=${gain}dB,adelay=${ms}|${ms}[s${i}]`;
});
filters.push(
  `[1:a]${SFX.map((_, i) => `[s${i}]`).join("")}amix=inputs=${SFX.length + 1}:normalize=0:duration=first,alimiter=limit=0.95,afade=t=out:st=44.3:d=0.7[a]`,
);
args.push(
  "-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
  "-vf", "scale=out_color_matrix=bt709:out_range=tv",
  "-c:a", "aac", "-b:a", "256k", "-t", "45", "-movflags", "+faststart", path.join(dir, "out", "cynote.mp4"),
);
const r = spawnSync(ffmpeg, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
