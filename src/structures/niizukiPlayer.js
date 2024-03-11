const { EventEmitter } = require("events");
const { Connection } = require("./niizukiConnection");
const { Queue } = require("./niizukiQueue");
const { scAutoPlay, spAutoPlay } = require("../functions/autoPlay");

class Player extends EventEmitter {
  constructor(niizuki, node, options) {
    super();
    this.niizuki = niizuki;
    this.node = node;
    this.options = options;
    this.guildId = options.guildId;
    this.textChannel = options.textChannel;
    this.voiceChannel = options.voiceChannel;
    this.connection = new Connection(this);
    this.mute = options.mute ?? false;
    this.deaf = options.deaf ?? false;
    this.volume = options.volume ?? 100;
    this.loop = options.loop ?? "none";
    this.data = {};
    this.queue = new Queue();
    this.position = 0;
    this.current = null;
    this.previous = null;
    this.playing = false;
    this.paused = false;
    this.connected = false;
    this.timestamp = 0;
    this.ping = 0;
    this.isAutoplay = false;

    this.on("playerUpdate", (packet) => {
      (this.connected = packet.state.connected),
        (this.position = packet.state.position),
        (this.ping = packet.state.ping);
      this.timestamp = packet.state.time;

      this.niizuki.emit("playerUpdate", this, packet);
    });

    this.on("event", (data) => {
      this.handleEvent(data);
    });
  }

  async play() {
    if (!this.connected) throw new Error("Player are not initialize.");
    if (!this.queue.length) return;

    this.current = this.queue.shift();

    if (!this.current.track) {
      this.current = await this.current.resolve(this.niizuki);
    }

    this.playing = true;
    this.position = 0;

    const { track } = this.current;

    this.node.rest.updatePlayer({
      guildId: this.guildId,
      data: {
        encodedTrack: track,
      },
    });

    return this;
  }

  /**
   *
   * @param {this} player
   * @returns
   */
  async autoplay(player) {
    if (!player) {
      if (player == null) {
        this.isAutoplay = false;
        return this;
      } else if (player == false) {
        this.isAutoplay = false;
        return this;
      } else throw new Error("No argument provided.");
    }

    this.isAutoplay = true;

    // If ran on queueEnd event
    if (player.previous) {
      if (player.previous.info.sourceName === "youtube") {
        try {
          let data = `https://www.youtube.com/watch?v=${player.previous.info.identifier}&list=RD${player.previous.info.identifier}`;
          let response = await this.niizuki.resolve({
            query: data,
            source: "ytmsearch",
            requester: player.previous.info.requester,
          });

          if (
            !response ||
            !response.tracks ||
            ["error", "empty"].includes(response.loadType)
          )
            return this.stop();

          let track =
            response.tracks[
              Math.floor(Math.random() * Math.floor(response.tracks.length))
            ];
          this.queue.push(track);
          this.play();
          return this;
        } catch (e) {
          return this.stop();
        }
      } else if (player.previous.info.sourceName === "soundcloud") {
        try {
          scAutoPlay(player.previous.info.uri).then(async (data) => {
            let response = await this.niizuki.resolve({
              query: data,
              source: "scsearch",
              requester: player.previous.info.requester,
            });

            if (
              !response ||
              !response.tracks ||
              ["error", "empty"].includes(response.loadType)
            )
              return this.stop();

            let track =
              response.tracks[
                Math.floor(Math.random() * Math.floor(response.tracks.length))
              ];
            this.queue.push(track);
            this.play();
            return this;
          });
        } catch (e) {
          console.log(e);
          return this.stop();
        }
      } else if (player.previous.info.sourceName === "spotify") {
        try {
          spAutoPlay(player.previous.info.identifier).then(async (data) => {
            const response = await this.niizuki.resolve({
              query: `https://open.spotify.com/track/${data}`,
              requester: player.previous.info.requester,
            });

            if (
              !response ||
              !response.tracks ||
              ["error", "empty"].includes(response.loadType)
            )
              return this.stop();

            let track =
              response.tracks[
                Math.floor(Math.random() * Math.floor(response.tracks.length))
              ];
            this.queue.push(track);
            this.play();
            return this;
          });
        } catch (e) {
          console.log(e);
          return this.stop();
        }
      }
    } else return this;
  }

  connect(options = this) {
    const { guildId, voiceChannel, deaf = true, mute = false } = options;
    this.send({
      guild_id: guildId,
      channel_id: voiceChannel,
      self_deaf: deaf,
      self_mute: mute,
    });
    this.connected = true;
    this.niizuki.emit(
      "debug",
      this.guildId,
      "Player has been successfully connected."
    );
  }

  stop() {
    this.position = 0;
    this.playing = false;
    this.node.rest.updatePlayer({
      guildId: this.guildId,
      data: { encodedTrack: null },
    });
    return this;
  }

  pause(toggle = true) {
    this.node.rest.updatePlayer({
      guildId: this.guildId,
      data: { paused: toggle },
    });
    this.playing = !toggle;
    this.paused = toggle;
    return this;
  }

  seek(position) {
    const trackLength = this.current.info.length;
    this.position = Math.max(0, Math.min(trackLength, position));
    this.node.rest.updatePlayer({ guildId: this.guildId, data: { position } });
  }

  setVolume(volume) {
    if (volume < 0 || volume > 100) {
      throw new Error("Volume number must be between 0 to 100.");
    }
    this.node.rest.updatePlayer({ guildId: this.guildId, data: { volume } });
    this.volume = volume;
    return this;
  }

  setLoop(mode) {
    if (!mode) {
      throw new Error("You must provide an argument to set loop.");
    }
    if (!["none", "track", "queue"].includes(mode)) {
      throw new Error("Set loop rguments must be 'none', 'track', or 'queue'");
    }
    this.loop = mode;
    return this;
  }

  setTextChannel(channel) {
    if (typeof channel !== "string")
      throw new TypeError("Channel must be present and a non-empty string.");
    this.textChannel = channel;
    return this;
  }

  setVoiceChannel(channel, options) {
    if (typeof channel !== "string")
      throw new TypeError("Channel must be present and a non-empty string.");

    if (this.connected && channel === this.voiceChannel) {
      throw new ReferenceError(
        `Player is already connected to channel: ${channel}.`
      );
    }
    this.voiceChannel = channel;

    if (options) {
      this.mute = options.mute ?? this.mute;
      this.deaf = options.deaf ?? this.deaf;
    }

    this.connect({
      deaf: this.deaf,
      guildId: this.guildId,
      voiceChannel: this.voiceChannel,
      textChannel: this.textChannel,
      mute: this.mute,
    });
    return this;
  }

  disconnect() {
    if (!this.voiceChannel) {
      return;
    }
    this.connected = false;
    this.send({
      guild_id: this.guildId,
      channel_id: null,
      self_mute: false,
      self_deaf: false,
    });
    this.voiceChannel = null;
    return this;
  }

  destroy() {
    this.disconnect();
    this.node.rest.destroyPlayer(this.guildId);
    this.niizuki.emit("playerDisconnect", this);
    this.niizuki.emit(
      "debug",
      this.guildId,
      "Destroyed the player and clear the queue."
    );
    this.niizuki.players.delete(this.guildId);
  }

  async handleEvent(payload) {
    const player = this.niizuki.players.get(payload.guildId);
    if (!player) return;
    const track = this.current;
    track.info.thumbnail = await track.info.thumbnail;

    switch (payload.type) {
      case "TrackStartEvent":
        this.trackStart(player, track, payload);
        break;
      case "TrackEndEvent":
        this.trackEnd(player, track, payload);
        break;
      case "TrackExceptionEvent":
        this.trackError(player, track, payload);
        break;
      case "TrackStuckEvent":
        this.trackStuck(player, track, payload);
        break;
      case "WebSocketClosedEvent":
        this.socketClosed(player, payload);
        break;
      default:
        const error = new Error(
          `Node encountered an unknown event: '${payload.type}'`
        );
        this.niizuki.emit("nodeError", this, error);
        break;
    }
  }

  trackStart(player, track, payload) {
    this.playing = true;
    this.paused = false;
    this.niizuki.emit("trackStart", player, track, payload);
  }

  trackEnd(player, track, payload) {
    this.previous = track;
    if (this.loop === "track") {
      player.queue.unshift(this.previous);
      this.niizuki.emit("trackEnd", player, track, payload);
      return player.play();
    } else if (track && this.loop === "queue") {
      player.queue.push(this.previous);
      this.niizuki.emit("trackEnd", player, track, payload);
      return player.play();
    }

    if (player.queue.length === 0) {
      this.playing = false;
      return this.niizuki.emit("queueEnd", player);
    } else if (player.queue.length > 0) {
      this.niizuki.emit("trackEnd", player, track, payload);
      return player.play();
    }
    this.playing = false;
    this.niizuki.emit("queueEnd", player);
  }

  trackError(player, track, payload) {
    this.niizuki.emit("trackError", player, track, payload);
    this.stop();
  }

  trackStuck(player, track, payload) {
    this.niizuki.emit("trackStuck", player, track, payload);
    this.stop();
  }

  socketClosed(player, payload) {
    if ([4015, 4009].includes(payload.code)) {
      this.send({
        guild_id: payload.guildId,
        channel_id: this.voiceChannel,
        self_mute: this.mute,
        self_deaf: this.deaf,
      });
    }

    this.niizuki.emit("socketClosed", player, payload);
    this.pause(true);
    this.niizuki.emit("debug", this.guildId, "An error has occured.");
  }

  set(key, value) {
    return (this.data[key] = value);
  }

  get(key) {
    return this.data[key];
  }

  send(data) {
    this.niizuki.send({ op: 4, d: data });
  }
}

module.exports = { Player };
