// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server);

// app.use(express.static('public'));

// io.on('connection', (socket) => {
//     console.log("Client connected:", socket.id);

//     socket.on("offer", (offer) => {
//         socket.broadcast.emit("offer", offer);
//     });

//     socket.on("answer", (answer) => {
//         socket.broadcast.emit("answer", answer);
//     });

//     socket.on("ice-candidate", (candidate) => {
//         socket.broadcast.emit("ice-candidate", candidate);
//     });
// });

// server.listen(3000, () => {
//     console.log("Server running on http://localhost:3000");
// });

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

    const filename = `recording-${socket.id}-${Date.now()}.webm`;
    const filePath = path.join(__dirname, "recordings", filename);

    // Ensure the directory exists
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const fileStream = fs.createWriteStream(filePath, { flags: "a" });

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

    socket.on("binarystream", (chunk) => {
        fileStream.write(Buffer.from(chunk));
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
