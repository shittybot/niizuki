<div align="center">
  <h1>niizuki</h1>
  <p>A simple discord music bot wrapper.</p>
  <p>
  <a href="https://www.npmjs.com/package/niizuki"><img src="https://img.shields.io/npm/v/niizuki?maxAge=3600" alt="NPM version" /></a>
  <p>
  <p>
    <a href="https://www.npmjs.com/package/niizuki"><img src="https://nodei.co/npm/niizuki.png?downloads=true&stars=true" alt="NPM Banner"></a>
  </p>
  </div>

  ## Install
```sh
npm install niizuki
# or
yarn add niizuki
```

## Example
```js
const { Niizuki } = require("niizuki"); // Import niizuki

client.on("ready", async (client) => {
  // defined nodes
  const nodes = [
    {
      name: "localhost",
      host: "",
      password: "",
      port: 2333,
      secure: false,
    },
  ];

  // initialize manager
  client.manager = new Niizuki(nodes, {
    send: (payload) => {
      const guild = this.guilds.cache.get(payload.d.guild_id);
      if (guild) guild.shard.send(payload);
    },
    defaultSearchPlatform: "ytmsearch",
    reconnectTimeout: 600000,
    reconnectTries: 1000,
  });
});

client.on("interactionCreate", async (interaction) => {
  if (slashCmd === "play") {
    const player = client.manager.createConnection({
      guildId: interaction.guild.id,
      voiceChannel: interaction.member.voice.channel.id,
      textChannel: interaction.channel.id,
      deaf: true,
    });

    const resolve = await client.riffy.resolve({
      query: query,
      requester: interaction.user.id,
    });
    const { loadType, tracks, playlistInfo } = resolve;

    if (loadType === "track" || loadType === "search") {
      const track = tracks.shift();
      player.queue.add(track);
      interaction.reply(
        `Add [${track.info.title}](${track.info.uri}) to the queue.`
      );
      if (!player.playing && !player.paused) return player.play();
    }

    if (loadType === "playlist") {
      for (const track of resolve.tracks) {
        track.info.requester = interaction.user.id;
        player.queue.add(track);
      }

      interaction.reply(`Add \`${playlistInfo.name}\` to the queue`);
      if (!player.playing && !player.paused) return player.play();
    } else {
      return interaction.reply("There are no results found.");
    }
  }
});

client.login("token");

client.manager.on("nodeConnect", async (node) => {
  console.log(`${node.name} is connected.`);
});

client.manager.on("nodeDisconnect", async (node) => {
  console.log(`${node.name} is disconnected.`);
});

client.manager.on("trackStart", async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);

  channel.send(
    `Now Playing: [${track.info.title}](${track.info.uri}) [${track.info.requester}]`
  );
});

client.manager.on("queueEnd", async (player, track) => {
  const channel = client.channels.cache.get(player.textChannel);

  let autoPlay = false;

  if (autoPlay) {
    player.autoplay(player);
  } else {
    player.destroy();
    channel.send(`The queue has ended`);
  }
});

```