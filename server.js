const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Phục vụ tệp index.html và các tài nguyên tĩnh
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));  // Đảm bảo gửi file từ thư mục hiện tại
});

// Nếu có các tài nguyên tĩnh như CSS, JS, bạn có thể lưu trong thư mục /public
app.use(express.static('public'));

const rooms = {};  // Lưu trạng thái các phòng và người chơi
const gamesHistory = {};  // Lưu lịch sử các ván chơi

// Khi có kết nối từ người chơi
io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);

  // Xử lý khi người chơi tạo hoặc tham gia phòng
  socket.on('joinRoom', ({ playerName, roomNumber }) => {
    if (!rooms[roomNumber]) {
      rooms[roomNumber] = {
        players: [],
        board: [],
        currentTurn: 'X'
      };
      gamesHistory[roomNumber] = [];  // Khởi tạo lịch sử cho phòng mới
    }

    // Kiểm tra xem phòng đã đủ 2 người chơi chưa
    if (rooms[roomNumber].players.length >= 2) {
      socket.emit('roomFull');
      return;
    }

    // Lưu người chơi vào phòng
    rooms[roomNumber].players.push({ id: socket.id, name: playerName, symbol: rooms[roomNumber].players.length === 0 ? 'X' : 'O' });

    socket.join(roomNumber);
    socket.emit('roomJoined', { roomNumber, board: rooms[roomNumber].board });

    // Gửi lịch sử ván chơi khi người chơi tham gia
    if (gamesHistory[roomNumber].length > 0) {
      socket.emit('gameHistory', gamesHistory[roomNumber]);
    }

    if (rooms[roomNumber].players.length === 2) {
      io.to(roomNumber).emit('startGame', rooms[roomNumber].players);
    }
  });

  // Xử lý khi người chơi di chuyển
  socket.on('makeMove', ({ roomNumber, x, y }) => {
    const room = rooms[roomNumber];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.currentTurn !== player.symbol) return;

    if (!room.board[x]) room.board[x] = [];
    if (room.board[x][y]) return;  // Ô này đã có quân cờ

    room.board[x][y] = player.symbol;
    io.to(roomNumber).emit('moveMade', { x, y, symbol: player.symbol });

    // Lưu lịch sử di chuyển
    gamesHistory[roomNumber].push({ x, y, symbol: player.symbol });

    // Kiểm tra xem người chơi có thắng không
    if (checkWin(room.board, x, y, player.symbol)) {
      io.to(roomNumber).emit('gameOver', { winner: player.name });
      delete rooms[roomNumber];  // Xóa phòng khi có người thắng
      delete gamesHistory[roomNumber];  // Xóa lịch sử khi ván chơi kết thúc
    } else {
      // Đổi lượt
      room.currentTurn = room.currentTurn === 'X' ? 'O' : 'X';
    }
  });

  // Xử lý khi người chơi ngắt kết nối
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    for (let roomNumber in rooms) {
      rooms[roomNumber].players = rooms[roomNumber].players.filter(p => p.id !== socket.id);
      io.to(roomNumber).emit('playerLeft');
      if (rooms[roomNumber].players.length === 0) {
        delete rooms[roomNumber];  // Xóa phòng nếu không còn người chơi
        delete gamesHistory[roomNumber];  // Xóa lịch sử phòng
      }
    }
  });
});

// Kiểm tra xem có 5 quân giống nhau liên tiếp không
function checkWin(board, x, y, symbol) {
  return checkDirection(board, x, y, symbol, 1, 0) ||  // Hàng ngang
         checkDirection(board, x, y, symbol, 0, 1) ||  // Hàng dọc
         checkDirection(board, x, y, symbol, 1, 1) ||  // Chéo /
         checkDirection(board, x, y, symbol, 1, -1);   // Chéo \
}

// Kiểm tra quân giống nhau theo hướng
function checkDirection(board, x, y, symbol, dx, dy) {
  let count = 0;
  for (let i = -4; i <= 4; i++) {
    const nx = x + i * dx;
    const ny = y + i * dy;
    if (board[nx] && board[nx][ny] === symbol) {
      count++;
      if (count === 5) return true;
    } else {
      count = 0;
    }
  }
  return false;
}

// Chạy server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
