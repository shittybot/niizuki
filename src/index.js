const { Connection } = require("./structures/niizukiConnection");
const { Node } = require("./structures/niizukiNode");
const { Niizuki } = require("./structures/Niizuki");
const { Player } = require("./structures/niizukiPlayer");
const { Queue } = require("./structures/niizukiQueue");
const { Rest } = require("./structures/niizukiRest");
const { Track } = require("./structures/niizukiTrack");

module.exports = { Connection, Node, Niizuki, Player, Queue, Rest, Track };