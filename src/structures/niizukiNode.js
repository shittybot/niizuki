const Websocket = require("ws");
const { Rest } = require("./niizukiRest");

class Node {
  constructor(niizuki, node, options) {
    this.niizuki = niizuki;
    this.name = node.name || node.host;
    this.host = node.host || "localhost";
    this.port = node.port || 2333;
    this.password = node.password || "youshallnotpass";
    this.secure = node.secure || false;
    this.sessionId = node.sessionId || null;
    this.rest = new Rest(niizuki, this);
    this.wsUrl = `ws${this.secure ? "s" : ""}://${this.host}:${
      this.port
    }/v4/websocket`;
    this.restUrl = `http${this.secure ? "s" : ""}://${this.host}:${this.port}`;
    this.ws = null;
    this.send = options.send;
    this.region = null;
    this.stats = {
      players: 0,
      playingPlayers: 0,
      uptime: 0,
      memory: {
        free: 0,
        used: 0,
        allocated: 0,
        reservable: 0,
      },
      cpu: {
        cores: 0,
        systemLoad: 0,
        lavalinkLoad: 0,
      },
      frameStats: {
        sent: 0,
        nulled: 0,
        deficit: 0,
      },
    };
    this.connected = false;
    this.resumeKey = options.resumeKey || null;
    this.resumeTimeout = options.resumeTimeout || 60;
    this.autoResume = options.autoResume || false;
    this.reconnectTimeout = options.reconnectTimeout || 5000;
    this.reconnectTries = options.reconnectTries || 3;
    this.reconnectAttempt = null;
    this.reconnectAttempted = 1;
  }

  connect() {
    if (this.ws) this.ws.close();
    const headers = {
      Authorization: this.password,
      "User-Id": this.niizuki.clientId,
      "Client-Name": `Niizuki@${require("../../package.json").version}`,
    };

    if (this.sessionId) headers["Session-Id"] = this.sessionId;

    this.ws = new Websocket(this.wsUrl, { headers });
    this.ws.on("open", this.open.bind(this));
    this.ws.on("error", this.error.bind(this));
    this.ws.on("message", this.message.bind(this));
    this.ws.on("close", this.close.bind(this));
  }

  open() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    this.niizuki.emit("nodeConnect", this);
    this.connected = true;
    this.niizuki.emit(
      "debug",
      this.name,
      `Lavalink connected on ${this.wsUrl}`
    );

    if (this.autoResume) {
      for (const player of this.niizuki.players.values()) {
        if (player.node === this) {
          player.restart();
        }
      }
    }
  }

  error(event) {
    if (!event) return;
    this.niizuki.emit("nodeError", this, event);
  }

  message(msg) {
    if (Array.isArray(msg)) msg = Buffer.concat(msg);
    else if (msg instanceof ArrayBuffer) msg = Buffer.from(msg);

    const payload = JSON.parse(msg.toString());
    if (!payload.op) return;

    this.niizuki.emit("niizukiRaw", payload);
    this.niizuki.emit(
      "debug",
      this.name,
      `Node Update : ${JSON.stringify(payload)}`
    );

    if (payload.op === "stats") {
      this.stats = { ...payload };
    }

    if (payload.op === "ready") {
      if (this.sessionId !== payload.sessionId) {
        this.rest.setSessionId(payload.sessionId);
        this.sessionId = payload.sessionId;
      }

      this.niizuki.emit(
        "debug",
        this.name,
        `Payload received ${JSON.stringify(payload)}`
      );

      if (this.sessionId) {
        this.rest.makeRequest(
          `PATCH`,
          `/${this.rest.version}/sessions/${this.sessionId}`,
          { resuming: true, timeout: this.resumeTimeout }
        );
        this.niizuki.emit("debug", this.name, `Node resuming.`);
      }
    }

    const player = this.niizuki.players.get(payload.guildId);
    if (payload.guildId && player) player.emit(payload.op, payload);
  }

  close(event, reason) {
    this.niizuki.emit("nodeDisconnect", this, { event, reason });
    this.niizuki.emit(
      "debug",
      `Lavalink connection closed with Error code : ${event || "Unknown code"}`
    );
    this.connected = false;
    this.reconnect();
  }

  reconnect() {
    this.reconnectAttempt = setTimeout(() => {
      if (this.reconnectAttempted >= this.reconnectTries) {
        const error = new Error(
          `Unable to connect node: ${this.name} after ${this.reconnectTries} attempts.`
        );

        this.niizuki.emit("nodeError", this, error);
        return this.destroy();
      }

      this.ws.removeAllListeners();
      this.ws = null;
      this.niizuki.emit("nodeReconnect", this);
      this.connect();
      this.reconnectAttempted++;
    }, this.reconnectTimeout);
  }

  destroy() {
    if (!this.connected) return;

    const player = this.niizuki.players.filter(
      (player) => player.node === this
    );
    if (player.size) player.forEach((player) => player.destroy());

    if (this.ws) this.ws.close(1000, "destroy");
    this.ws.removeAllListeners();
    this.ws = null;

    this.reconnectAttempted = 1;
    clearTimeout(this.reconnectAttempt);

    this.niizuki.emit("nodeDestroy", this);
    this.niizuki.destroyPlayer(player.guildId);

    this.niizuki.nodeMap.delete(this.name);
    this.connected = false;
  }

  send(payload) {
    const data = JSON.stringify(payload);
    this.ws.send(data, (error) => {
      if (error) return error;
      return null;
    });
  }

  disconnect() {
    if (!this.connected) return;
    this.niizuki.players.forEach((player) => {
      if (player.node == this) {
        player.move();
      }
    });
    this.ws.close(1000, "destroy");
    this.ws?.removeAllListeners();
    this.ws = null;
    this.niizuki.nodes.delete(this.name);
    this.niizuki.emit("nodeDisconnect", this);
    this.connected = false;
  }

  get penalties() {
    let penalties = 0;
    if (!this.connected) return penalties;
    if (this.stats.players) {
      penalties += this.stats.players;
    }
    if (this.stats.cpu && this.stats.cpu.systemLoad) {
      penalties += Math.round(
        Math.pow(1.05, 100 * this.stats.cpu.systemLoad) * 10 - 10
      );
    }
    if (this.stats.frameStats) {
      if (this.stats.frameStats.deficit) {
        penalties += this.stats.frameStats.deficit;
      }
      if (this.stats.frameStats.nulled) {
        penalties += this.stats.frameStats.nulled * 2;
      }
    }
    return penalties;
  }
}

module.exports = { Node };
