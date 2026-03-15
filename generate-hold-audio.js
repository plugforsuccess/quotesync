#!/usr/bin/env node

/**
 * Cam Wiley Allstate Agency — Hold Audio Production Pipeline
 *
 * Generates a phone-system-ready hold music loop by:
 *   1. Generating TTS WAV files via OpenAI gpt-4o-mini-tts (voice: nova)
 *   2. Normalizing & phone-optimizing each spoken file with FFmpeg
 *   3. Normalizing the background music bed
 *   4. Mixing each spoken message over the music bed
 *   5. Concatenating all message blocks into a single looping WAV
 *
 * Usage:  node generate-hold-audio.js
 * Requires: OPENAI_API_KEY in .env, FFmpeg installed, assets/hold_music.wav present
 */

import { HOLD_MESSAGES } from "./hold_messages.js";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TTS_MODEL = "gpt-4o-mini-tts";
const TTS_VOICE = "nova";
const TTS_FORMAT = "wav";

const MUSIC_BED_PATH = "assets/hold_music.wav";

const DIRS = {
  raw: "dist/raw",
  processed: "dist/processed",
  loops: "dist/loops",
  final: "dist/final",
};

// Volume balance
const MUSIC_VOLUME = 0.18;
const VOICE_VOLUME = 1.8;

// Each message block: music bed duration (seconds).
// Actual duration adapts per-message; this is the minimum padding.
const MUSIC_PRE_ROLL = 1; // seconds of music before voice starts
const MUSIC_POST_ROLL = 5; // seconds of music tail after voice ends

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirs() {
  for (const dir of Object.values(DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Run an FFmpeg command and return stdout/stderr. */
async function ffmpeg(args) {
  try {
    const { stdout, stderr } = await exec("ffmpeg", args);
    return { stdout, stderr };
  } catch (err) {
    console.error(`FFmpeg error: ${err.message}`);
    if (err.stderr) console.error(err.stderr);
    throw err;
  }
}

/** Get duration of a WAV file in seconds via ffprobe. */
async function getDuration(filePath) {
  const { stdout } = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

/** Load OPENAI_API_KEY from .env file. */
function loadApiKey() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env file. Create one with OPENAI_API_KEY=sk-...");
  }
  const contents = fs.readFileSync(envPath, "utf-8");
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.+)\s*$/);
    if (match) return match[1].trim();
  }
  throw new Error("OPENAI_API_KEY not found in .env");
}

// ---------------------------------------------------------------------------
// Pipeline Steps
// ---------------------------------------------------------------------------

/**
 * Step 1 — Generate raw TTS WAV files via OpenAI API.
 */
async function generateTTS(messages, apiKey) {
  console.log("\n=== Step 1: Generating TTS audio ===\n");

  for (const msg of messages) {
    const outPath = path.join(DIRS.raw, `${msg.id}.wav`);

    // Skip if already generated (for faster re-runs during development)
    if (fs.existsSync(outPath)) {
      console.log(`  [skip] ${msg.id} — already exists`);
      continue;
    }

    console.log(`  [tts]  ${msg.id} ...`);

    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: msg.text,
        response_format: TTS_FORMAT,
        speed: msg.speed,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI TTS failed for ${msg.id}: ${res.status} ${body}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
    console.log(`         → ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
}

/**
 * Step 2 — Phone-optimize each spoken file.
 *
 * Applies: high-pass 120 Hz, low-pass 3400 Hz, compression, loudnorm,
 * converts to mono 8 kHz 16-bit PCM.
 */
async function processVoices(messages) {
  console.log("\n=== Step 2: Processing voices for phone clarity ===\n");

  for (const msg of messages) {
    const inPath = path.join(DIRS.raw, `${msg.id}.wav`);
    const outPath = path.join(DIRS.processed, `${msg.id}.wav`);

    console.log(`  [proc] ${msg.id}`);

    await ffmpeg([
      "-y", "-i", inPath,
      "-af",
      "highpass=f=120,lowpass=f=3400,compand=attacks=0.3:decays=0.8:points=-80/-80|-20/-10|0/-3,loudnorm",
      "-ar", "8000",
      "-ac", "1",
      "-sample_fmt", "s16",
      outPath,
    ]);
  }
}

/**
 * Step 3 — Normalize the background music bed.
 */
async function processMusicBed() {
  console.log("\n=== Step 3: Normalizing music bed ===\n");

  const outPath = path.join(DIRS.processed, "hold_music_bed.wav");

  await ffmpeg([
    "-y", "-i", MUSIC_BED_PATH,
    "-af", "loudnorm",
    "-ar", "8000",
    "-ac", "1",
    "-sample_fmt", "s16",
    outPath,
  ]);

  console.log(`  → ${outPath}`);
}

/**
 * Step 4 — Mix each processed voice over the music bed.
 *
 * For each message:
 *   - Trims the music bed to (voice_duration + pre_roll + post_roll) seconds
 *   - Delays the voice by MUSIC_PRE_ROLL seconds
 *   - Mixes voice over music with configured volumes
 */
async function mixMessages(messages) {
  console.log("\n=== Step 4: Mixing messages over music bed ===\n");

  const musicBedPath = path.join(DIRS.processed, "hold_music_bed.wav");

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const voicePath = path.join(DIRS.processed, `${msg.id}.wav`);
    const outPath = path.join(DIRS.loops, `loop_${String(i + 1).padStart(2, "0")}.wav`);

    // Get voice duration to calculate music bed trim length
    const voiceDuration = await getDuration(voicePath);
    const totalDuration = MUSIC_PRE_ROLL + voiceDuration + MUSIC_POST_ROLL;

    console.log(`  [mix]  ${msg.id}  voice=${voiceDuration.toFixed(1)}s  block=${totalDuration.toFixed(1)}s`);

    // Build filter graph:
    //   - Trim music bed to totalDuration, apply volume
    //   - Delay voice by MUSIC_PRE_ROLL, apply volume
    //   - Mix together
    const filterComplex = [
      `[0:a]atrim=0:${totalDuration},asetpts=N/SR/TB,volume=${MUSIC_VOLUME}[music]`,
      `[1:a]adelay=${MUSIC_PRE_ROLL * 1000}|${MUSIC_PRE_ROLL * 1000},volume=${VOICE_VOLUME}[voice]`,
      `[music][voice]amix=inputs=2:duration=longest[mixed]`,
    ].join(";");

    await ffmpeg([
      "-y",
      "-i", musicBedPath,
      "-i", voicePath,
      "-filter_complex", filterComplex,
      "-map", "[mixed]",
      "-ar", "8000",
      "-ac", "1",
      "-sample_fmt", "s16",
      outPath,
    ]);
  }
}

/**
 * Step 5 — Concatenate all loop blocks into final hold track.
 */
async function concatenateLoops(messages) {
  console.log("\n=== Step 5: Building final hold loop ===\n");

  // Write concat manifest
  const manifestPath = path.join(DIRS.loops, "manifest.txt");
  const manifestLines = messages.map((_, i) => {
    const filename = `loop_${String(i + 1).padStart(2, "0")}.wav`;
    return `file '${filename}'`;
  });
  fs.writeFileSync(manifestPath, manifestLines.join("\n") + "\n");

  const outPath = path.join(DIRS.final, "hold_loop_phone.wav");

  await ffmpeg([
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", manifestPath,
    "-c", "copy",
    outPath,
  ]);

  const duration = await getDuration(outPath);
  const sizeMB = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);

  console.log(`  → ${outPath}`);
  console.log(`    Duration : ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`);
  console.log(`    Size     : ${sizeMB} MB`);
  console.log(`    Format   : WAV mono 8 kHz 16-bit PCM (phone-system ready)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Cam Wiley Allstate Agency                      ║");
  console.log("║  Hold Audio Production Pipeline                 ║");
  console.log("╚══════════════════════════════════════════════════╝");

  // Validate prerequisites
  if (!fs.existsSync(MUSIC_BED_PATH)) {
    throw new Error(`Music bed not found at ${MUSIC_BED_PATH}. Place your hold music WAV there first.`);
  }

  const apiKey = loadApiKey();
  ensureDirs();

  await generateTTS(HOLD_MESSAGES, apiKey);
  await processVoices(HOLD_MESSAGES);
  await processMusicBed();
  await mixMessages(HOLD_MESSAGES);
  await concatenateLoops(HOLD_MESSAGES);

  console.log("\n✓ Pipeline complete. Output: dist/final/hold_loop_phone.wav\n");
}

main().catch((err) => {
  console.error("\n✗ Pipeline failed:", err.message);
  process.exit(1);
});
