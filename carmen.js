import { config } from "dotenv";
import OpenAI from "openai";
import mic from "mic";
import fs from "fs";
import player from "play-sound";
import { readFile, writeFile } from "fs/promises";
import { Blob } from "buffer";
import { ElevenLabsClient } from "elevenlabs";


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
        fileType: "wav",
      });
  
      const micInput = micInstance.getAudioStream();
      const outputFile = fs.createWriteStream(outputPath);
      micInput.pipe(outputFile);
  
      let silenceStart = null;
      const silenceThreshold = 200; // adjust this lower = more sensitive
      const silenceDelay = 1200; // stop after 1s of silence
  
      micInput.on("data", (chunk) => {
        let total = 0;
      
        for (let i = 0; i < chunk.length; i += 2) {
          const sample = chunk.readInt16LE(i); // read 16-bit audio sample
          total += Math.abs(sample);
        }
      
        const avg = total / (chunk.length / 2);
        console.log("📉 Avg volume:", avg.toFixed(2));
      
        if (avg < silenceThreshold) {
          if (!silenceStart) silenceStart = Date.now();
          if (Date.now() - silenceStart > silenceDelay) {
            console.log("🛑 Silence triggered, stopping.");
            micInstance.stop();
          }
        } else {
          silenceStart = null;
        }
      });
  
      micInput.on("error", (err) => {
        console.error("Mic error:", err);
        reject(err);
      });
  
      micInput.on("stopComplete", () => {
        console.log("✅ Done recording");
        resolve();
      });
  
      console.log("🎙️ Listening... (speak, then pause to stop)");
      micInstance.start();
      
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
  
    return result.text.trim();
}



const systemPrompt = await readFile("carmen.txt", "utf-8");

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

const voiceId = "19STyYD15bswVz51nqLf"; // Rachel's voice

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
                //style: 0.7,                  // elevate that spy-drama delivery
                //use_speaker_boost: true,     // clarity, power, and presence
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
      console.log("🧾 You said:", userText);
  
      if (!userText || userText.trim().toLowerCase().includes("bye")) {
        console.log("👋 Take care! Talk soon.");
        break;
      }
  
      const gptReply = await sendToGPT(userText);
      console.log("🤖 Assistant:", gptReply);
  
      if (gptReply) {
        await speak(gptReply);
      }
    }
  }
  

chatLoop();



