"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeState = void 0;
const ws_1 = __importDefault(require("ws"));
const Request_1 = __importDefault(require("./utils/Request"));
const __1 = require("..");
const Player_1 = require("./Player");
const UnresolvedTrack_1 = __importDefault(require("./UnresolvedTrack"));
var NodeState;
(function (NodeState) {
    NodeState[NodeState["CONNECTING"] = 0] = "CONNECTING";
    NodeState[NodeState["CONNECTED"] = 1] = "CONNECTED";
    NodeState[NodeState["DISCONNECTED"] = 2] = "DISCONNECTED";
})(NodeState = exports.NodeState || (exports.NodeState = {}));
/**
 * Represents a lavalink Node structure.
 * @prop {State} state - The node state (CONNECTING, CONNECTED, DISCONNECTED)
 * @prop {Object} stats - The node stats
 * @prop {Object | null} versions - The lavalink node versions
 */
class Node {
    resumed;
    vulkava;
    options;
    ws;
    retryAttempts;
    state;
    stats;
    /** Version object for the node (undefined if lavalink does not support) */
    versions;
    static checkOptions(options) {
        if (typeof options !== 'object')
            throw new TypeError('NodeOptions must be an object');
        if (!options.hostname)
            throw new TypeError('NodeOptions.hostname is required');
        if (!options.port)
            throw new TypeError('NodeOptions.port is required');
        if (typeof options.hostname !== 'string')
            throw new TypeError('NodeOptions.hostname must be a string');
        if (typeof options.port !== 'number')
            throw new TypeError('NodeOptions.port must be a number');
        if (options.id && typeof options.id !== 'string')
            throw new TypeError('NodeOptions.id must be a string');
        if (options.password && typeof options.password !== 'string')
            throw new TypeError('NodeOptions.password must be a string');
        if (options.region && (typeof options.region !== 'string' || !['USA', 'EU'].includes(options.region)))
            throw new TypeError('NodeOptions.region must be a string and must be either "USA" or "EU"');
        if (options.resumeKey && typeof options.resumeKey !== 'string')
            throw new TypeError('NodeOptions.resumeKey must be a string');
        if (options.resumeTimeout && typeof options.resumeTimeout !== 'number')
            throw new TypeError('NodeOptions.resumeTimeout must be a number');
        if (options.secure && typeof options.secure !== 'boolean')
            throw new TypeError('NodeOptions.secure must be a boolean');
        if (options.followRedirects && typeof options.followRedirects !== 'boolean')
            throw new TypeError('NodeOptions.followRedirects must be a boolean');
        if (options.maxRetryAttempts && typeof options.maxRetryAttempts !== 'number')
            throw new TypeError('NodeOptions.maxRetryAttempts must be a number');
        if (options.retryAttemptsInterval && typeof options.retryAttemptsInterval !== 'number')
            throw new TypeError('NodeOptions.retryAttemptsInterval must be a number');
    }
    /**
     * Create a new Vulkava instance
     * @param {Vulkava} vulkava - The Vulkava instance
     * @param {Object} options - The node options
     * @param {String} [options.id] - The lavalink node identifier
     * @param {String} options.hostname - The lavalink node hostname
     * @param {Number} options.port - The lavalink node port
     * @param {String} [options.password] - The lavalink node password
     * @param {Boolean} [options.secure] - Whether the lavalink node uses TLS/SSL or not
     * @param {String} [options.region] - The lavalink node region
     * @param {String} [options.resumeKey] - The resume key
     * @param {Number} [options.resumeTimeout] - The resume timeout, in seconds
     * @param {Number} [options.maxRetryAttempts] - The max number of reconnect attempts
     * @param {Number} [options.retryAttemptsInterval] - The interval between reconnect attempts, in milliseconds
     */
    constructor(vulkava, options) {
        Node.checkOptions(options);
        this.vulkava = vulkava;
        this.options = options;
        this.retryAttempts = 0;
        this.state = NodeState.DISCONNECTED;
        this.stats = {
            playingPlayers: 0,
            players: 0,
            uptime: 0,
            memory: {
                reservable: 0,
                used: 0,
                free: 0,
                allocated: 0,
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
            }
        };
        this.ws = null;
    }
    get identifier() {
        return this.options.id ?? this.options.hostname;
    }
    connect() {
        if (this.state !== NodeState.DISCONNECTED)
            return;
        ++this.retryAttempts;
        this.state = NodeState.CONNECTING;
        const headers = {
            Authorization: this.options.password,
            'User-Id': this.vulkava.clientId,
            'Client-Name': `Vulkava/${__1.VERSION}`
        };
        if (this.options.resumeKey)
            Object.assign(headers, { 'Resume-Key': this.options.resumeKey });
        this.ws = new ws_1.default(`ws${this.options.secure ? 's' : ''}://${this.options.hostname}:${this.options.port}`, {
            headers,
            followRedirects: this.options.followRedirects
        });
        this.ws.onopen = this.open.bind(this);
        this.ws.onmessage = this.message.bind(this);
        this.ws.onerror = this.error.bind(this);
        this.ws.onclose = this.close.bind(this);
        this.ws.once('upgrade', this.upgrade.bind(this));
    }
    disconnect() {
        if (this.state === NodeState.DISCONNECTED || this.ws === null)
            return;
        this.ws.close(1000, 'Vulkava: disconnect');
    }
    /** Fetches versions from lavalink Node */
    async fetchVersions() {
        const versions = await this.request('GET', 'versions');
        if (versions.BUILD)
            this.versions = versions;
        else
            delete this.versions;
    }
    /**
     * Gets the route planner status
     * @returns {Promise<Object>}
     */
    getRoutePlannerStatus() {
        return this.request('GET', 'routeplanner/status');
    }
    /**
     * Unmarks a failed address
     * @param {String} address - The address to unmark
     */
    unmarkFailedAddress(address) {
        return this.request('POST', 'routeplanner/free/address', { address });
    }
    /**
     * Unmarks all failed address
     */
    unmarkAllFailedAddress() {
        return this.request('POST', 'routeplanner/free/all');
    }
    /**
     * Gets the node ws connection latency or the latency between discord gateway & lavalink if guildId param provided.
     * @param {String} [guildId]
     * @returns {Promise<Number>}
     */
    // Use this lavalink .jar in order to use this function https://github.com/davidffa/lavalink/releases
    ping(guildId) {
        return new Promise((resolve, reject) => {
            if (this.state !== NodeState.CONNECTED)
                resolve(Infinity);
            const t1 = Date.now();
            const rejectTimeout = setTimeout(() => {
                reject(new Error('Lavalink Node took more than 2 seconds to respond.\nDo your Lavalink Node supports ping op?'));
            }, 2000);
            const pong = (node, ping) => {
                if (node !== this)
                    return;
                resolve(ping ?? (Date.now() - t1));
                this.vulkava.removeListener('pong', pong);
                clearTimeout(rejectTimeout);
            };
            this.vulkava.on('pong', pong);
            this.send({ op: 'ping', guildId });
        });
    }
    send(payload) {
        if (this.state !== NodeState.CONNECTED || !this.ws?.OPEN)
            return;
        this.ws.send(JSON.stringify(payload));
    }
    setupResuming() {
        if (!this.options.resumeKey)
            return;
        const payload = {
            op: 'configureResuming',
            key: this.options.resumeKey,
            timeout: this.options.resumeTimeout ?? 60
        };
        this.send(payload);
    }
    async pollTrack(player) {
        let newTrack = player.queue.shift() ?? null;
        if (newTrack) {
            if (newTrack instanceof UnresolvedTrack_1.default) {
                try {
                    newTrack = await newTrack.build();
                }
                catch (err) {
                    this.vulkava.emit('error', this, err);
                    this.pollTrack(player);
                    return;
                }
            }
            player.current = newTrack;
            player.play();
            return;
        }
        this.vulkava.emit('queueEnd', player);
    }
    handlePlayerEvent(e) {
        const player = this.vulkava.players.get(e.guildId);
        if (!player) {
            this.vulkava.emit('warn', this, `Unhandled player event. Player not found for guild ${e.guildId}`);
            return;
        }
        switch (e.type) {
            case 'TrackStartEvent':
                this.handleTrackStart(e, player);
                break;
            case 'TrackEndEvent':
                this.handleTrackEnd(e, player);
                break;
            case 'TrackStuckEvent':
                this.handleTrackStuck(e, player);
                break;
            case 'TrackExceptionEvent':
                this.handleTrackExeption(e, player);
                break;
            case 'WebSocketClosedEvent':
                this.handleWSClose(e, player);
                break;
            default:
                this.vulkava.emit('warn', this, `Unhandled player event. Unknown event type: ${e.type}`);
                break;
        }
    }
    handleTrackStart(_, player) {
        player.playing = true;
        player.paused = false;
        if (player.moving) {
            player.moving = false;
            return;
        }
        this.vulkava.emit('trackStart', player, player.current);
    }
    async handleTrackEnd(ev, player) {
        // If a player is moving node
        if (player.node !== this)
            return;
        if (ev.reason === 'REPLACED') {
            if (player.queueRepeat && player.current) {
                player.queue.push(player.current);
            }
            return;
        }
        player.playing = false;
        if (['LOAD_FAILED', 'CLEANUP'].includes(ev.reason)) {
            this.vulkava.emit('trackEnd', player, player.current, ev.reason);
            this.pollTrack(player);
            return;
        }
        this.vulkava.emit('trackEnd', player, player.current, ev.reason);
        if (player.trackRepeat) {
            player.play();
            return;
        }
        if (player.queueRepeat && player.current) {
            player.queue.push(player.current);
        }
        this.pollTrack(player);
    }
    handleTrackStuck(ev, player) {
        this.vulkava.emit('trackStuck', player, player.current, ev.thresholdMs);
    }
    handleTrackExeption(ev, player) {
        this.vulkava.emit('trackExeption', player, player.current, ev.exception);
        player.skip();
    }
    handleWSClose(ev, player) {
        this.vulkava.emit('wsDisconnect', player, ev.code, ev.reason);
        switch (ev.code) {
            case 1006:
            case 4015:
                player.sendVoiceUpdate();
                break;
            case 4006:
            case 4009:
                player.state = Player_1.ConnectionState.DISCONNECTED;
                player.connect();
                break;
        }
    }
    // ---------- WebSocket event handlers ----------
    open() {
        this.state = NodeState.CONNECTED;
        this.vulkava.emit('nodeConnect', this);
        this.retryAttempts = 0;
        if (!this.resumed) {
            this.setupResuming();
        }
        delete this.resumed;
    }
    message({ data }) {
        const payload = JSON.parse(data);
        switch (payload.op) {
            case 'stats':
                delete payload.op;
                this.stats = payload;
                break;
            case 'pong':
                this.vulkava.emit('pong', this, payload.ping);
                break;
            case 'playerUpdate':
                this.vulkava.players.get(payload.guildId)?.updatePlayer(payload.state);
                break;
            case 'event':
                this.handlePlayerEvent(payload);
                break;
            default:
                this.vulkava.emit('warn', this, 'Unknown payload op: ' + payload.op);
                break;
        }
        this.vulkava.emit('raw', this, payload);
    }
    error({ error, message }) {
        if (message.includes('connect ECONNREFUSED'))
            return;
        if (message.includes('401')) {
            this.retryAttempts = Infinity;
            this.vulkava.emit('error', this, new Error('Authentication failed!'));
            return;
        }
        this.vulkava.emit('error', this, error);
    }
    close({ code, reason, wasClean }) {
        this.state = NodeState.DISCONNECTED;
        this.ws?.removeAllListeners();
        this.ws = null;
        if (wasClean) {
            this.vulkava.emit('nodeDisconnect', this, code, reason);
            return;
        }
        const newNode = this.vulkava.nodes.filter(n => n.state === NodeState.CONNECTED).sort((a, b) => a.stats.players - b.stats.players)[0];
        if (newNode) {
            for (const player of this.vulkava.players.values()) {
                if (player.node === this) {
                    player.moveNode(newNode);
                }
            }
        }
        this.vulkava.emit('error', this, new Error(`WebSocket closed abnormally with code ${code}: ${reason}`));
        if (this.retryAttempts > (this.options.maxRetryAttempts ?? 10))
            return;
        if (this.retryAttempts === 0)
            this.connect();
        else
            setTimeout(() => this.connect(), this.options.retryAttemptsInterval ?? 5000);
    }
    upgrade(msg) {
        if (msg.headers['session-resumed'] === 'true') {
            this.resumed = true;
            this.vulkava.emit('nodeResume', this);
        }
        if (this.versions)
            return;
        if (msg.headers['lavalink-version'] === 'davidffa/lavalink') {
            this.fetchVersions();
        }
        else {
            delete this.versions;
        }
    }
    // REST
    request(method, endpoint, body) {
        return (0, Request_1.default)(`http${this.options.secure ? 's' : ''}://${this.options.hostname}:${this.options.port}/${endpoint}`, {
            method,
            headers: {
                Authorization: this.options.password,
            },
            body
        });
    }
}
exports.default = Node;