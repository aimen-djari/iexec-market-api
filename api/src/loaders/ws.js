const WebSocket = require('ws');
const { nanoid } = require('nanoid');

// const redis = require('redis').createClient;
// const config = require('../config');
const { logger } = require('../utils/logger');
const { throwIfMissing } = require('../utils/error');

const log = logger.extend('ws');

const init = (server = throwIfMissing()) => {
  log('init ws');

  // const redisConfig = { host: config.redis.host };
  // const pubClient = redis(redisConfig);
  // const subClient = redis(redisConfig);
  //
  // pubClient.on('error', (err) => log('pubClient', 'Error', err));
  // subClient.on('error', (err) => log('subClient', 'Error', err));

  // room subscription management
  const rooms = {};
  const joinRoom = (room, socket) => {
    if (!rooms[room]) {
      rooms[room] = {}; // create the room
      console.log('created room', room);
    }
    if (!rooms[room][socket.uuid]) {
      rooms[room][socket.uuid] = socket; // join the room
    }
  };
  const leaveRoom = (room, socket) => {
    if (!rooms[room][socket.uuid]) {
      // not present: do nothing
      return;
    }
    if (Object.keys(rooms[room]).length === 1) {
      // if the one exiting is the last one, destroy the room
      delete rooms[room];
      console.log('destroyed room', room);
    } else {
      // otherwise simply leave the room
      delete rooms[room][socket.uuid];
    }
  };
  const leaveAll = (socket) => {
    Object.keys(rooms).forEach((room) => {
      leaveRoom(room, socket);
    });
  };

  const handleMessage = (socket, [type, payload] = []) => {
    switch (type) {
      case 'join':
        {
          const { chainId, topic } = payload;
          if (chainId && topic) {
            const room = `${chainId}:${topic}`;
            joinRoom(room, socket);
            socket.send(JSON.stringify(['joinACK', { chainId, topic }]));
          }
        }
        break;
      case 'leave':
        {
          const { chainId, topic } = payload;
          if (chainId && topic) {
            const room = `${chainId}:${topic}`;
            leaveRoom(room, socket);
            socket.send(JSON.stringify(['leaveACK', { chainId, topic }]));
          }
        }
        break;
      case 'leaveAll':
        leaveAll(socket);
        socket.send(JSON.stringify(['leaveAllACK']));
        break;
      default:
    }
  };

  const handleSocketClose = (socket) => {
    // close cleanup effects
    console.log('connection closed');
    leaveAll(socket);
  };

  const wss = new WebSocket.Server({ server });
  wss.on('connection', (socket) => {
    const uuid = nanoid(); // create here a uuid for this connection
    socket.uuid = uuid;
    socket.on('message', (data) => {
      try {
        const [type, payload] = JSON.parse(data);
        console.log('type', type, 'payload', payload);
        // business logic
        handleMessage(socket, [type, payload]);
      } catch (e) {
        console.log(e);
      }
    });
    socket.on('close', () => {
      handleSocketClose(socket);
    });
  });

  // heartbeat logic close any connection not responding to ping timeout
  const DEAD_CLIENT_TIMEOUT = 30000;
  const heartbeat = (socket) => {
    socket.isAlive = true;
  };
  wss.on('connection', (socket) => {
    heartbeat(socket);
    socket.on('pong', () => {
      heartbeat(socket);
    });
  });
  const interval = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (socket.isAlive === false) {
        socket.terminate();
        console.log('terminated');
      } else {
        socket.isAlive = false;
        socket.ping(() => {});
      }
    });
  }, DEAD_CLIENT_TIMEOUT);
};

module.exports = { init };
