class Connection {
  /**
   * @param {import ("../index").Player} player
   */
  constructor(player) {
    this.player = player;
    this.sessionId = null;
    this.voice = {
      event: null,
      endpoint: null,
      sessionId: null,
    };
    this.self_deaf = false;
    this.self_mute = false;
    this.region = null;
    this.voiceChannel = player.voiceChannel;
  }

  setServerUpdate(data) {
    const { endpoint, token } = data;

    if (!endpoint) throw new Error("Invalid session. Please try again.");

    this.voice.endpoint = endpoint;
    this.voice.token = token;
    this.region = endpoint.split(".").shift()?.replace(/[0-9]/g, "") || null;

    if (this.player.paused) {
      this.player.niizuki.emit(
        "debug",
        this.player.node.name,
        `Unpaused ${this.player.guildId}.`
      );
      this.player.pause(false);
    }

    this.updatePlayerVoiceData();
  }

  setStateUpdate(data) {
    const { session_id, channel_id, self_deaf, self_mute } = data;

    if (channel_id == null) {
      this.player.destroy();
      this.player.emit("playerDestroy", this.player);
    }

    if (
      this.player.voiceChannel &&
      channel_id &&
      this.player.voiceChannel !== channel_id
    ) {
      this.player.emit("playerMove", this.player.voiceChannel, channel_id);
      this.player.voiceChannel = channel_id;
      this.voiceChannel = channel_id;
    }

    this.self_deaf = self_deaf;
    this.self_mute = self_mute;
    this.voice.sessionId = session_id || null;
  }

  updatePlayerVoiceData() {
    this.player.niizuki.emit(
      "debug",
      this.player.node.name,
      `Update player data: ${JSON.stringify({ voice: this.voice })}`
    );
    this.player.node.rest.updatePlayer({
      guildId: this.player.guildId,
      data: { voice: this.voice },
    });
  }
}

module.exports = { Connection };
