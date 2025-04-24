import { config } from "dotenv";
import OpenAI from "openai";
import mic from "mic";
import fs from "fs";
import player from "play-sound";
import { readFile, writeFile } from "fs/promises";
import { Blob } from "buffer";
import { ElevenLabsClient } from "elevenlabs";
import readline from "readline";
import { text } from "stream/consumers";


config();

const openAi = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const eleven = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
});



function recordAudio(outputPath = "input.wav") {
  return new Promise((resolve, reject) => {
    const micInstance = mic({
      rate: "16000",
      channels: "1",
      debug: false,
      fileType: "wav"
    });

    const micInput = micInstance.getAudioStream();
    const outputFile = fs.createWriteStream(outputPath);
    micInput.pipe(outputFile);

    micInput.on("error", (err) => {
      console.error("Mic error:", err);
      reject(err);
    });

    micInput.on("stopComplete", () => {
      console.log("✅ Recording stopped.");
      resolve();
    });

    console.log("🎙️ Listening... Press [space] to stop recording.");
    micInstance.start();

    // Listen for spacebar to stop
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    function handleKeyPress(_, key) {
      if (key.name === "space") {
        micInstance.stop();
        process.stdin.removeListener("keypress", handleKeyPress);
      }

      if (key.ctrl && key.name === "c") {
        console.log("\n👋 Recording cancelled.");
        process.exit();
      }
    }

    process.stdin.on("keypress", handleKeyPress);
  });
}


async function transcribeAudio(filePath = "input.wav") {
    const fileData = await readFile(filePath);
    const audioBlob = new Blob([fileData], { type: "audio/wav" });
  
    const result = await eleven.speechToText.convert({
      file: audioBlob,
      model_id: "scribe_v1",
      tag_audio_events: false,
      language_code: "eng",
      diarize: false,
    });
    console.log(result.text);
    return result.text.trim();
    
}



const systemPrompt = await readFile("tami.txt", "utf-8");

const replies = [
    {role: "system", content: systemPrompt.trim()}];

async function sendToGPT(userInput) {
    replies.push({role: "user", content: userInput});
    const response = await openAi.chat.completions.create({
        model: "chatgpt-4o-latest",
        messages: replies
    });
    const reply = response.choices[0]?.message?.content.trim();
    replies.push({ role: "assistant", content: reply });
    return reply;
}

const voiceId = "piTKgcLEGmPE4e6mEKli"; // Jess' voice

async function speak(thingo) {
    const audio = await eleven.textToSpeech.convert(
    voiceId,
        {
            text: thingo,
            model_id: "eleven_flash_v2_5",
            output_format: "mp3_44100_128",
            voice_settings: {
                stability: 0.6,             // expressive without losing her chill
                similarity_boost: 0.7,      // still feels like the same Carmen each time
                speed: 1.1                  // a tiny bit slower — adds flair and seduction
            }
        }
    );
 
    // No need for arrayBuffer here — audio is already a Buffer
    await writeFile("reply.mp3", audio);

    const audioPlayer = player();
    return new Promise((resolve, reject) => {
        audioPlayer.play("reply.mp3", (err) => {
          if (err) {
            console.error("❌ Failed to play audio:", err);
            reject(err);
          } else {
            resolve(); // ✅ Finish only when audio playback is done
          }
        });
    });
}


async function chatLoop() {
  console.log("👋 Hey! I'm your assistant. Just talk to me — say 'bye' to end.\n");

  while (true) {
    await recordAudio("input.wav");
    const userText = await transcribeAudio("input.wav");

    if (userText.toLowerCase().includes("bye")) {
      console.log("👋 Take care! Tami's clocking off.");
      process.exit();
    }

    const reply = await sendToGPT(userText);
    console.log("Tami", reply);

    if (reply) {
      await speak(reply);
    }

    // Optional: slight pause before next recording
    await new Promise(res => setTimeout(res, 1000));
  }
}
 

chatLoop();










