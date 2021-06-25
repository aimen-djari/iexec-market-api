const WebSocket = require("ws");

const API_BASE_URL = "ws://localhost:3000";
// const API_BASE_URL = "wss://22cc9114f52c.ngrok.io";

// ws.on("open", () => {
//   ws.send("hello from client");
//   ws.send(JSON.stringify("join", {room: "deals"}, message: "nothing" }));
// });
// ws.on("message", data => {
//   console.log(data);
// });

const Wrapper = ws => {
  // heartbeat logic
  const DEAD_SERVER_TIMEOUT = 60000;
  const heartbeat = (ws, delay) => {
    clearTimeout(ws.pingTimeout);
    ws.pingTimeout = setTimeout(() => {
      ws.terminate();
      console.log("terminated");
    }, delay);
  };
  const ping = () => {
    console.log("received ping");
    heartbeat(ws, DEAD_SERVER_TIMEOUT);
  };
  ws.on("ping", ping)
    .on("open", ping)
    .on("close", () => {
      clearTimeout(ws.pingTimeout);
    });

  ws.on("open", () => {
    ws.send(JSON.stringify(["join", { topic: "deals", chainId: 5 }]));
  });
  ws.on("message", data => {
    try {
      const [type, payload] = JSON.parse(data);
      console.log("type", type, "payload", payload);
    } catch (e) {
      // iognore message
      // console.error(e);
    }
  });
  ws.on("error", console.log);
  return {
    join: payload => ws.send(JSON.stringify(["join", payload])),
    leave: payload => ws.send(JSON.stringify(["leave", payload])),
    leaveAll: () => ws.send(JSON.stringify(["leaveAll"]))
  };
};

const wsWrapper = Wrapper(new WebSocket(API_BASE_URL));
