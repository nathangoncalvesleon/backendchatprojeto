const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const cors = require('cors');
const Pool = require('pg').Pool;
const { addUser, removeUser, getUser, getUsersInRoom } = require('./users');
const router = require('./router');

const pool = new Pool({
  user: 'username',
  host: 'host',
  database: 'db',
  password: 'password',
  port: 5432,
})

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(cors());
app.use(router);

io.on('connect', (socket) => {
  let address = socket.request.connection.remoteAddress;
  socket.on('join', ({ name, room }, callback) => {
    if (room === undefined || room == null || room === '') {
      room = 'publica' //Default
    }
    if (name && room) {
      console.log('Novo usuário', name, 'SALA:', room, 'Socket ID: ' + socket.id);
      const { error, user } = addUser({ id: socket.id, name, room, ip: address });
      if (error) return callback(error);
      if (user.room) {
        socket.join(user.room);
        socket.emit('message', { user: 'admin', text: `Olá ${user.name}, bem-vindo ao ${user.room} chat room` });
        pool.query('SELECT * FROM message,room WHERE room.name = $1 ORDER BY time DESC LIMIT 10', [user.room], (err, result) => {
          if (err) {
            // console.log(err);
          } else {
            for (let i = result.rows.length - 1; i >= 0; i--) {
              let row = result.rows[i];
              socket.emit('message', { user: row.username, text: row.message, time: row.time, old: true });
            }
          }
        })
        if (user) {
          socket.broadcast.to(user.room).emit('message', { user: 'admin', text: `${user.name} entrou no chat` });
          io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });
        }
      }
    }
    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id);
    console.log(user.name + ' enviou uma mensagem: ' + message.text);
    if (user !== undefined) {
      pool.query('INSERT INTO message (roomid,message,time,username) VALUES ($1,$2,$3,$4)', [1, message.text, message.time, user.name], (err, res) => {
        // console.log(err, res)
      })
      io.to(user.room).emit('message', { user: user.name, text: message.text, time: message.time });
    }
    callback();
  });

  socket.on('disconnect', () => {
    const user = removeUser(socket.id);
    if (user) {
      io.to(user.room).emit('message', { user: 'admin', text: `${user.name} acabou de sair.` });
      console.log(user.name, 'acabou de sair.');
      io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });
    }
  })
});

server.listen('link', () => console.log(`Server has started`));
console.log('Server is running on port 5000');
