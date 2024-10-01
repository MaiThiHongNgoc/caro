const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
app.use(cors());


const app = express();
const server = http.createServer(app);
const io = new Server(server);

let rooms = {}; // Store information about game rooms

// Serve index.html when accessing /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Create a room
    socket.on('createRoom', (roomId) => {
        socket.join(roomId);
        rooms[roomId] = { players: [socket.id], board: Array(9).fill(null), turn: 0, scores: { player1: 0, player2: 0 } };
        socket.emit('roomCreated', roomId);
    });

    // Join a room
    socket.on('joinRoom', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players.length === 1) {
            socket.join(roomId);
            room.players.push(socket.id);
            io.to(roomId).emit('startGame', room.players);
        } else {
            socket.emit('roomFull');
        }
    });

    // Player move
    socket.on('move', (data) => {
        const { roomId, index } = data;
        const room = rooms[roomId];
        if (room && room.players.includes(socket.id)) {
            const currentPlayer = room.turn % 2;
            if (socket.id === room.players[currentPlayer] && room.board[index] === null) {
                room.board[index] = currentPlayer === 0 ? 'X' : 'O';
                room.turn++;
                io.to(roomId).emit('updateBoard', room.board);

                const winner = checkWinner(room.board);
                if (winner !== null) {
                    room.scores[`player${winner + 1}`]++;
                    io.to(roomId).emit('gameOver', { winner, scores: room.scores });

                    // Reset board for the next round
                    setTimeout(() => {
                        room.board = Array(9).fill(null);
                        room.turn = 0;
                        io.to(roomId).emit('updateBoard', room.board);
                    }, 2000);
                } else if (room.board.every(cell => cell !== null)) {
                    io.to(roomId).emit('gameOver', { winner: null, scores: room.scores });
                    
                    // Reset board for the next round
                    setTimeout(() => {
                        room.board = Array(9).fill(null);
                        room.turn = 0;
                        io.to(roomId).emit('updateBoard', room.board);
                    }, 2000);
                }
            }
        }
    });

    // Play with AI
    socket.on('playWithAi', () => {
        let board = Array(9).fill(null);
        let turn = 0;
        let scores = { player: 0, ai: 0 }; // Track scores

        socket.emit('startGame', 'AI');

        socket.on('aiMove', (index) => {
            if (board[index] === null) {
                board[index] = 'X'; // Player moves first
                turn++;

                const winner = checkWinner(board);
                if (winner !== null || board.every(cell => cell !== null)) {
                    if (winner === 0) scores.player++; // Player wins
                    if (winner === 1) scores.ai++; // AI wins
                    socket.emit('gameOver', { winner, scores });
                    setTimeout(() => {
                        board = Array(9).fill(null); // Reset board
                        socket.emit('updateBoard', board);
                    }, 2000); // Reset board after 2 seconds
                    return;
                }

                // AI move
                const availableMoves = board.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
                const aiMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
                board[aiMove] = 'O'; // AI marks "O"
                turn++;

                io.to(socket.id).emit('updateBoard', board);

                const aiWinner = checkWinner(board);
                if (aiWinner !== null || board.every(cell => cell !== null)) {
                    if (aiWinner === 1) scores.ai++; // AI wins
                    if (aiWinner === 0) scores.player++; // Player wins
                    socket.emit('gameOver', { winner: aiWinner, scores });
                    setTimeout(() => {
                        board = Array(9).fill(null); // Reset board
                        socket.emit('updateBoard', board);
                    }, 2000); // Reset board after 2 seconds
                }
            }
        });
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Check for a winner
function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Horizontal
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Vertical
        [0, 4, 8], [2, 4, 6]             // Diagonal
    ];

    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a] === 'X' ? 0 : 1; // Player 0 (X) or Player 1 (O) wins
        }
    }
    return null;
}

// Start the server
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
