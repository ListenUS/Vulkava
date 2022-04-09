"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionState = void 0;
const Filters_1 = __importDefault(require("./Filters"));
const Node_1 = require("./Node");
const UnresolvedTrack_1 = __importDefault(require("./UnresolvedTrack"));
var ConnectionState;
(function (ConnectionState) {
    ConnectionState[ConnectionState["CONNECTING"] = 0] = "CONNECTING";
    ConnectionState[ConnectionState["CONNECTED"] = 1] = "CONNECTED";
    ConnectionState[ConnectionState["DISCONNECTED"] = 2] = "DISCONNECTED";
})(ConnectionState = exports.ConnectionState || (exports.ConnectionState = {}));
/**
 * Represents a Player structure
 * @prop {Node} node - The node that this player is connected to
 * @prop {Filters} filters - The filters instance of this player
 * @prop {String} guildId - The guild id of this player
 * @prop {String} voiceChannelId - The voice channel id of this player
 * @prop {String} [textChannelId] - The text channel id of this player
 * @prop {Boolean} [selfMute] - Whether or not this player is muted
 * @prop {Boolean} [selfDeaf] - Whether or not this player is deafened
 * @prop {Track | null} current - The current track of this player
 * @prop {Array<Track | UnresolvedTrack>} queue - The queue of this player
 * @prop {Boolean} trackRepeat - Whether to repeat the current track
 * @prop {Boolean} queueRepeat - Whether to repeat the queue
 * @prop {Boolean} playing - Whether this player is playing or not
 * @prop {Boolean} paused - Whether this player is paused or not
 * @prop {State} state - The state of this player (CONNECTING, CONNECTED, DISCONNECTED)
 * @prop {Object} voiceState - The player voicestate
 */
class Player {
    vulkava;
    node;
    guildId;
    filters;
    voiceChannelId;
    textChannelId;
    selfDeaf;
    selfMute;
    current;
    queue;
    queueRepeat;
    trackRepeat;
    position;
    positionTimestamp;
    playing;
    paused;
    state;
    voiceState;
    moving;
    static checkOptions(options) {
        if (!options.guildId)
            throw new TypeError('You must provide a guildId.');
        if (typeof options.guildId !== 'string')
            throw new TypeError('guildId must be a string.');
        if (!options.voiceChannelId)
            throw new TypeError('You must provide a voiceChannelId.');
        if (typeof options.voiceChannelId !== 'string')
            throw new TypeError('voiceChannelId must be a string.');
        if (options.textChannelId && typeof options.textChannelId !== 'string')
            throw new TypeError('textChannelId must be a string.');
        if (options.selfDeaf && typeof options.selfDeaf !== 'boolean')
            throw new TypeError('selfDeaf must be a boolean.');
        if (options.selfMute && typeof options.selfMute !== 'boolean')
            throw new TypeError('selfMute must be a boolean.');
    }
    /**
     * Create a new Player instance
     * @param {Vulkava} vulkava - The vulkava instance
     * @param {Object} options - The player options
     * @param {String} options.guildId - The guild id of this player
     * @param {String} options.voiceChannelId - The voice channel id of this player
     * @param {String} [options.textChannelId] - The text channel id of this player
     * @param {Boolean} [options.selfMute] - Whether or not this player is muted
     * @param {Boolean} [options.selfDeaf] - Whether or not this player is deafened
     */
    constructor(vulkava, options) {
        Player.checkOptions(options);
        this.vulkava = vulkava;
        this.guildId = options.guildId;
        this.filters = new Filters_1.default(this);
        this.voiceChannelId = options.voiceChannelId;
        this.textChannelId = options.textChannelId ?? null;
        this.selfDeaf = options.selfDeaf ?? false;
        this.selfMute = options.selfMute ?? false;
        this.current = null;
        this.queue = [];
        this.queueRepeat = false;
        this.trackRepeat = false;
        this.position = 0;
        this.positionTimestamp = 0;
        this.playing = false;
        this.paused = false;
        this.moving = false;
        this.state = ConnectionState.DISCONNECTED;
        this.voiceState = {};
        this.assignNode();
    }
    /**
     * Gets the exact track position based on the last playerUpdate packet
     */
    get exactPosition() {
        if (this.paused)
            return this.position;
        const filterConfig = this.filters.active.timescale;
        const rate = filterConfig?.rate ?? 1;
        const speed = filterConfig?.speed ?? 1;
        return Math.min(this.current?.duration ?? 0, (this.position + (Date.now() - this.positionTimestamp)) * rate * speed);
    }
    /**
     * Gets the queue duration in milliseconds
     */
    get queueDuration() {
        return this.queue.reduce((acc, curr) => acc + curr.duration, 0);
    }
    /**
     * Gets the volume of the player
     */
    get volume() {
        return (this.filters.active.volume ?? 1) * 100;
    }
    /**
     * Assigns a Node to this player
     * @private
     */
    assignNode() {
        const node = this.vulkava.bestNode;
        this.node = node;
    }
    /**
     * Connects to the voice channel
     */
    connect() {
        if (this.state === ConnectionState.CONNECTED)
            return;
        if (!this.voiceChannelId) {
            throw new Error('No voice channel id provided');
        }
        if (this.node === null) {
            this.assignNode();
        }
        this.state = ConnectionState.CONNECTING;
        this.vulkava.sendWS(this.guildId, {
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: this.voiceChannelId,
                self_mute: this.selfMute,
                self_deaf: this.selfDeaf
            }
        });
        if (this.connectTimeout)
            clearTimeout(this.connectTimeout);
        this.connectTimeout = setTimeout(() => {
            this.state = ConnectionState.DISCONNECTED;
            throw new Error('Voice connection timeout. See possible solutions here: https://vulkava.js.org/common-issues');
        }, 10000);
    }
    /**
     * Disconnects from the voice channel
     */
    disconnect() {
        this.vulkava.sendWS(this.guildId, {
            op: 4,
            d: {
                guild_id: this.guildId,
                channel_id: null
            }
        });
        this.state = ConnectionState.DISCONNECTED;
    }
    /**
     * Destroys the player
     */
    destroy() {
        this.disconnect();
        this.node?.send({
            op: 'destroy',
            guildId: this.guildId
        });
        this.vulkava.players.delete(this.guildId);
    }
    /**
     * @param {Node} node - The target node to move the player
     */
    moveNode(node) {
        if (!node)
            throw new TypeError('You must provide a Node instance.');
        if (node.state !== Node_1.NodeState.CONNECTED)
            throw new Error('The provided node is not connected.');
        if (this.node === node)
            return;
        this.moving = true;
        this.node?.send({
            op: 'destroy',
            guildId: this.guildId,
        });
        this.node = node;
        if (Object.keys(this.voiceState).length === 2) {
            this.state = ConnectionState.CONNECTING;
            this.sendVoiceUpdate();
        }
        if (this.filters.enabled) {
            this.filters.apply();
        }
        if (this.playing && this.current) {
            const payload = {
                op: 'play',
                guildId: this.guildId,
                track: this.current.encodedTrack,
                startTime: this.current?.isStream ? 0 : this.position
            };
            this.node.send(payload);
        }
        else {
            this.moving = false;
        }
    }
    /**
     * Gets the latency between discord voice gateway & lavalink node.
     * @returns {Promise<Number>}
     */
    async ping() {
        if (this.node === null || this.state !== ConnectionState.CONNECTED)
            return Infinity;
        return this.node.ping(this.guildId);
    }
    /**
     * Plays a track
     * @param {Object} [options] - Play options
     * @param {Number} [options.startTime] - Start time in milliseconds
     * @param {Number} [options.endTime] - End time in milliseconds
     * @param {Boolean} [options.noReplace] - Whether to ignore operation if a track is already playing or paused
     */
    async play(options) {
        if (this.node === null) {
            this.assignNode();
        }
        if (!this.current) {
            let newTrack = this.queue.shift() ?? null;
            if (newTrack) {
                if (newTrack instanceof UnresolvedTrack_1.default) {
                    newTrack = await newTrack.build();
                }
            }
            else {
                throw new Error('The queue is empty!');
            }
            this.current = newTrack;
        }
        this.node?.send({
            op: 'play',
            guildId: this.guildId,
            track: this.current.encodedTrack,
            ...options
        });
    }
    /**
     * Sets the track looping
     * @param {Boolean} state - Whether to enable track looping or not
     */
    setTrackLoop(state) {
        this.trackRepeat = state;
    }
    /**
     * Sets the queue looping
     * @param {Boolean} state - Whether to enable queue looping or not
     */
    setQueueLoop(state) {
        this.queueRepeat = state;
    }
    /**
     * Sets the player voice channel
     * @param {String} channelId - The voice channel id
     */
    setVoiceChannel(channelId) {
        if (!channelId || typeof channelId !== 'string')
            throw new TypeError('Voice channel id must be a string.');
        if (this.voiceChannelId === channelId)
            return;
        this.voiceChannelId = channelId;
        this.state = ConnectionState.DISCONNECTED;
        this.connect();
    }
    /**
     * Shuffles the queue
     */
    shuffleQueue() {
        if (this.queue.length) {
            let j;
            for (let i = this.queue.length - 1; i; i--) {
                j = Math.floor(Math.random() * (i + 1));
                [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
            }
        }
    }
    /**
     * Skips the current playing track
     * @param {Number} [amount=1] - The amount of tracks to skip
     */
    skip(amount = 1) {
        if (!this.playing)
            return;
        if (amount > this.queue.length) {
            this.queue = [];
        }
        else {
            this.queue.splice(0, amount - 1);
        }
        this.node?.send({
            op: 'stop',
            guildId: this.guildId
        });
    }
    /**
     * Pause or unpause the player
     * @param {Boolean} [state=true] - Whether to pause or unpause the player
     */
    pause(state = true) {
        if (typeof state !== 'boolean') {
            throw new TypeError('State must be a boolean');
        }
        if (!this.playing)
            return;
        if (this.node === null)
            throw new Error('Assertion failed. The player does not have a node.');
        this.paused = state;
        this.node.send({
            op: 'pause',
            guildId: this.guildId,
            pause: state
        });
    }
    /**
     * Seek to a specific position in the track
     * @param {Number} position - The position to seek, in milliseconds
     */
    seek(position) {
        if (!this.playing || !this.current || !this.current.isSeekable)
            return;
        if (typeof position !== 'number') {
            throw new TypeError('Position must be a number');
        }
        if (position > this.current.duration) {
            this.skip();
            return;
        }
        this.node?.send({
            op: 'seek',
            guildId: this.guildId,
            position
        });
    }
    sendVoiceUpdate() {
        if (this.node === null) {
            this.assignNode();
        }
        if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            delete this.connectTimeout;
        }
        this.state = ConnectionState.CONNECTED;
        this.node?.send({
            op: 'voiceUpdate',
            guildId: this.guildId,
            ...this.voiceState
        });
    }
    updatePlayer(state) {
        if (state.position)
            this.position = state.position;
        if (state.time)
            this.positionTimestamp = state.time;
        if (state.connected) {
            if (this.state !== ConnectionState.CONNECTED)
                this.state = ConnectionState.CONNECTED;
        }
        else if (this.state !== ConnectionState.DISCONNECTED) {
            this.state = ConnectionState.DISCONNECTED;
        }
    }
}
exports.default = Player;