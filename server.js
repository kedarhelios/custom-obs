const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let streamerSocketId = null;
let viewerSocketId = null;

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("role", (role) => {
        if (role === "streamer") {
            streamerSocketId = socket.id;
            console.log("Streamer connected:", streamerSocketId);
        } else if (role === "viewer") {
            viewerSocketId = socket.id;
            console.log("Viewer connected:", viewerSocketId);
        }
    });

    socket.on("offer", (offer) => {
        if (viewerSocketId) {
            io.to(viewerSocketId).emit("offer", offer);
        }
    });

    socket.on("answer", (answer) => {
        if (streamerSocketId) {
            io.to(streamerSocketId).emit("answer", answer);
        }
    });

    socket.on("ice-candidate", (candidate) => {
        // Forward ICE candidates to the *other* peer
        if (socket.id === streamerSocketId && viewerSocketId) {
            io.to(viewerSocketId).emit("ice-candidate", candidate);
        } else if (socket.id === viewerSocketId && streamerSocketId) {
            io.to(streamerSocketId).emit("ice-candidate", candidate);
        }
    });

    socket.on("disconnect", () => {
        if (socket.id === streamerSocketId) {
            streamerSocketId = null;
            console.log("Streamer disconnected");
        }
        if (socket.id === viewerSocketId) {
            viewerSocketId = null;
            console.log("Viewer disconnected");
        }
    });
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
