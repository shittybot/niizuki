const undici = require("undici");

class Rest {
    constructor(niizuki, options) {
        this.niizuki = niizuki;
        this.url = `http${options.secure ? "s" : ""}://${options.host}:${options.port}`;
        this.sessionId = options.sessionId;
        this.password = options.password;
        this.version = options.restVersion;
        this.calls = 0;
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }

    async makeRequest(method, endpoint, body = null) {
        const headers = {
            "Content-Type": "application/json",
            Authorization: this.password,
        };

        const requestOptions = {
            method,
            headers,
            body: body ? JSON.stringify(body) : null,
        };

        const response = await undici.fetch(this.url + endpoint, requestOptions);

        this.calls++

        if (response.statusCode === 204) {
            return null;
        }

        try {
            const data = await response.json();
            return data;
        } catch (e) {
            return null;
        }
    }

    async getPlayers() {
        return this.makeRequest("GET", `/v4/sessions/${this.sessionId}/players`);
    }

    async updatePlayer(options) {
        return this.makeRequest("PATCH", `/v4/sessions/${this.sessionId}/players/${options.guildId}?noReplace=false`, options.data).then((res) => {
            this.niizuki.emit("res", options.guildId, res);
        })
    }

    async destroyPlayer(guildId) {
        return this.makeRequest("DELETE", `/v4/sessions/${this.sessionId}/players/${guildId}`);
    }

    async getTracks(identifier) {
        return this.makeRequest("GET", `/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`).then((res) => {
            this.niizuki.emit("res", identifier, res);
        })
    }

    async decodeTrack(track, node) {
        if (!node) node = this.leastUsedNodes[0];
        return this.makeRequest(`GET`, `/v4/decodetrack?encodedTrack=${encodeURIComponent(track)}`);
    }

    async decodeTracks(tracks) {
        return await this.makeRequest(`POST`, `/v4/decodetracks`, tracks);
    }

    async getStats() {
        return this.makeRequest("GET", `/v4/stats`);
    }

    async getInfo() {
        return this.makeRequest("GET", `/v4/info`);
    }

    async getRoutePlannerStatus() {
        return await this.makeRequest(`GET`, `/v4/routeplanner/status`);
    }
    async getRoutePlannerAddress(address) {
        return this.makeRequest(`POST`, `/v4/routeplanner/free/address`, { address });
    }

    async parseResponse(req) {
        try {
            this.niizuki.emit("niizukiRaw", "Rest", await req.json());
            return await req.json();
        }
        catch (e) {
            return null;
        }
    }
}

module.exports = { Rest };