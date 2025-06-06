const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const spawn = require("child_process").spawn;
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let youtubeProcess;
let recordingProcess;
let isStreaming = false;

const recordingsDir = path.resolve("./recordings");
if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
}

// Generate unique filename with timestamp
const generateFilename = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `stream_${timestamp}.mp4`;
};

const youtubeOptions = [
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-r",
    "25",
    "-g",
    "50", // GOP size (25 * 2)
    "-keyint_min",
    "25",
    "-crf",
    "25",
    "-pix_fmt",
    "yuv420p",
    "-sc_threshold",
    "0",
    "-profile:v",
    "main",
    "-level",
    "3.1",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "32000", // Fixed the division issue
    "-f",
    "flv",
    "rtmp://a.rtmp.youtube.com/live2/vkzj-ek44-w8gp-1jhb-72ee",
];

// Local recording options
const recordingOptions = [
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-preset",
    "medium", // Better quality for local recording
    "-crf",
    "23", // Better quality
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k", // Higher audio quality for local
    "-ar",
    "44100",
    "-f",
    "mp4",
    path.join(recordingsDir, generateFilename()),
];

const startStreaming = () => {
    if (isStreaming) {
        console.log("⚠️ Streaming already in progress!");
        return;
    }

    console.log("🚀 Starting dual stream (YouTube + Local)...");

    // Start YouTube stream
    youtubeProcess = spawn("ffmpeg", youtubeOptions);

    // Start local recording
    recordingProcess = spawn("ffmpeg", recordingOptions);

    // YouTube process handlers
    youtubeProcess.stdout?.on("data", (data) => {
        // console.log(`YouTube stdout: ${data}`);
    });

    youtubeProcess.stderr?.on("data", (data) => {
        console.log(`📺 YouTube: ${data.toString().trim()}`);
    });

    youtubeProcess.on("close", (code) => {
        console.log(`📺 YouTube stream ended with code ${code}`);
    });

    youtubeProcess.on("error", (err) => {
        console.error(`❌ YouTube stream error:`, err);
    });

    // Recording process handlers
    recordingProcess.stdout?.on("data", (data) => {
        // console.log(`Recording stdout: ${data}`);
    });

    recordingProcess.stderr?.on("data", (data) => {
        console.log(`💾 Recording: ${data.toString().trim()}`);
    });

    recordingProcess.on("close", (code) => {
        console.log(`💾 Local recording ended with code ${code}`);
    });

    recordingProcess.on("error", (err) => {
        console.error(`❌ Recording error:`, err);
    });

    isStreaming = true;
};

const stopStreaming = () => {
    if (!isStreaming) {
        console.log("⚠️ No active stream to stop!");
        return;
    }

    console.log("🛑 Stopping streams...");

    if (youtubeProcess && !youtubeProcess.killed) {
        youtubeProcess.stdin?.end();
        youtubeProcess.kill("SIGTERM");
    }

    if (recordingProcess && !recordingProcess.killed) {
        recordingProcess.stdin?.end();
        recordingProcess.kill("SIGTERM");
    }

    isStreaming = false;
    console.log("✅ All streams stopped!");
};

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Streamer sends an offer
    socket.on("offer", (offer) => {
        console.log("Received offer from", socket.id);
        // Send the offer to all other clients (e.g., admin) with streamerId attached
        socket.broadcast.emit("offer", {
            offer,
            streamerId: socket.id,
        });
    });

    // Admin sends answer back to specific streamer
    socket.on("answer", ({ answer, streamerId }) => {
        console.log("Sending answer to", streamerId);
        io.to(streamerId).emit("answer", answer);
    });

    // ICE candidate from streamer or admin
    socket.on("ice-candidate", ({ candidate, streamerId }) => {
        if (streamerId) {
            // From admin to streamer
            io.to(streamerId).emit("ice-candidate", candidate);
        } else {
            // From streamer to admin(s)
            socket.broadcast.emit("ice-candidate", {
                candidate,
                streamerId: socket.id,
            });
        }
    });

    socket.on("binarystream", (stream) => {
        if (!isStreaming) {
            console.log(
                "⚠️ Received stream data but not streaming. Starting streams..."
            );
            startStreaming();
        }

        if (
            youtubeProcess &&
            youtubeProcess.stdin &&
            !youtubeProcess.stdin.destroyed
        ) {
            youtubeProcess.stdin.write(stream, (err) => {
                if (err) console.error("❌ YouTube write error:", err);
            });
        }

        if (
            recordingProcess &&
            recordingProcess.stdin &&
            !recordingProcess.stdin.destroyed
        ) {
            recordingProcess.stdin.write(stream, (err) => {
                if (err) console.error("❌ Recording write error:", err);
            });
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
