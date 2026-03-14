import "dotenv/config";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec as execCb } from "child_process";
import OpenAI from "openai";

const exec = promisify(execCb);

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const OUT_DIR = path.resolve("dist");
const SEGMENTS_DIR = path.join(OUT_DIR, "segments");

const VOICE = "nova"; // supported
const MODEL = "gpt-4o-mini-tts";

// Slight pacing variation by segment for more natural delivery
const SEGMENTS = [
  {
    id: "01_greeting",
    speed: 0.92,
    text: `Thank you for calling the Cam Wiley Allstate Agency — where you're in good hands.`,
  },
  {
    id: "02_busy",
    speed: 0.95,
    text: `Our team is currently assisting another client.`,
  },
  {
    id: "03_callback",
    speed: 0.9,
    text: `Please leave your name, phone number, and a brief message, and we will return your call shortly, typically within the same business day.`,
  },
  {
    id: "04_queue",
    speed: 0.9,
    text: `To ensure the fastest response, please leave one message, and our team will return calls in the order they are received.`,
  },
  {
    id: "05_quote",
    speed: 0.88,
    text: `If you're calling for an insurance quote, we'd be happy to help. Please let us know if you're looking for auto insurance, home insurance, or both.`,
  },
  {
    id: "06_closing",
    speed: 0.93,
    text: `We appreciate your call and look forward to speaking with you.`,
  },
];

function ensureDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(SEGMENTS_DIR, { recursive: true });
}

function buildPrompt(text, speed) {
  // Prompting the TTS model for cadence/prosody
  return [
    `Read this as a polished U.S. insurance agency receptionist voicemail.`,
    `Tone: warm, calm, professional, reassuring.`,
    `Pacing: natural and slightly deliberate.`,
    `Speaking rate target: ${speed}.`,
    `Use light pauses at commas and full pauses at sentence breaks.`,
    `Do not sound salesy, robotic, or overly cheerful.`,
    ``,
    text,
  ].join("\n");
}

async function generateSegment(segment) {
  const outputPath = path.join(SEGMENTS_DIR, `${segment.id}.wav`);

  console.log(
    `Generating segment: ${segment.id}.wav (voice: ${VOICE}, speed: ${segment.speed})`
  );

  const response = await client.audio.speech.create({
    model: MODEL,
    voice: VOICE,
    format: "wav",
    input: buildPrompt(segment.text, segment.speed),
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, audioBuffer);
  return outputPath;
}

async function concatSegments(segmentPaths) {
  const listFile = path.join(OUT_DIR, "segments.txt");
  const joined = segmentPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");

  fs.writeFileSync(listFile, joined);

  const concatenated = path.join(OUT_DIR, "voicemail_raw.wav");

  // concat demuxer is more reliable for wav than concat: URL syntax
  await exec(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${concatenated}"`
  );

  return concatenated;
}

async function processForPhone(inputPath) {
  const phonePath = path.join(OUT_DIR, "voicemail_phone.wav");
  const finalPath = path.join(OUT_DIR, "voicemail_final.wav");

  // Phone optimization: remove rumble, limit highs, normalize/compress, convert to 8k mono PCM
  await exec(
    [
      `ffmpeg -y -i "${inputPath}"`,
      `-af "highpass=f=120,lowpass=f=3400,compand=attacks=0.3:decays=0.8:points=-80/-80|-20/-10|0/-3,loudnorm"`,
      `-ar 8000 -ac 1 -sample_fmt s16`,
      `"${phonePath}"`,
    ].join(" ")
  );

  // Add padding so phone systems do not clip the start/end
  await exec(
    [
      `ffmpeg -y -i "${phonePath}"`,
      `-af "adelay=350|350,apad=pad_dur=0.5"`,
      `-ar 8000 -ac 1 -sample_fmt s16`,
      `"${finalPath}"`,
    ].join(" ")
  );

  return finalPath;
}

async function main() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    ensureDirs();

    console.log("=== Cam Wiley Allstate Agency — Voicemail Generator ===");

    const segmentPaths = [];
    for (const segment of SEGMENTS) {
      const p = await generateSegment(segment);
      segmentPaths.push(p);
    }

    console.log("Concatenating segments...");
    const rawPath = await concatSegments(segmentPaths);

    console.log("Processing for phone system...");
    const finalPath = await processForPhone(rawPath);

    console.log(`Done: ${finalPath}`);
  } catch (error) {
    console.error("Build failed.");
    console.error(error?.message || error);
    if (error?.status) {
      console.error(`status: ${error.status}`);
    }
    process.exit(1);
  }
}

main();
