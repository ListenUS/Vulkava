"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const UnresolvedTrack_1 = __importDefault(require("../UnresolvedTrack"));
const Request_1 = __importDefault(require("../utils/Request"));
class Spotify {
    vulkava;
    auth;
    market;
    token;
    renewDate;
    constructor(vulkava, clientId, clientSecret, market = 'US') {
        this.vulkava = vulkava;
        if (clientId && clientSecret) {
            this.auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        }
        else {
            this.auth = null;
        }
        this.market = market;
        this.token = null;
        this.renewDate = 0;
    }
    async getTrack(id) {
        const track = await this.makeRequest(`tracks/${id}`);
        return this.buildTrack(track);
    }
    async getAlbum(id) {
        const unresolvedTracks = [];
        let res = await this.makeRequest(`albums/${id}`);
        const title = res.name;
        for (const it of res.tracks.items) {
            if (it === null)
                continue;
            unresolvedTracks.push(this.buildTrack(it));
        }
        let next = res.tracks.next !== null;
        let offset = 50;
        while (next && unresolvedTracks.length < 400) {
            res = await this.makeRequest(`albums/${id}/tracks?offset=${offset}`);
            next = res.next !== null;
            for (const it of res.items) {
                unresolvedTracks.push(this.buildTrack(it));
            }
            offset += 50;
        }
        return { title, tracks: unresolvedTracks };
    }
    async getPlaylist(id) {
        const unresolvedTracks = [];
        let res = await this.makeRequest(`playlists/${id}`);
        const title = res.name;
        for (const it of res.tracks.items) {
            if (it.track === null)
                continue;
            unresolvedTracks.push(this.buildTrack(it.track));
        }
        let next = res.tracks.next !== null;
        let offset = 100;
        while (next && unresolvedTracks.length < 400) {
            res = await this.makeRequest(`playlists/${id}/tracks?offset=${offset}`);
            next = res.next !== null;
            for (const it of res.items) {
                if (it.track === null)
                    continue;
                unresolvedTracks.push(this.buildTrack(it.track));
            }
            offset += 100;
        }
        return { title, tracks: unresolvedTracks };
    }
    async getArtistTopTracks(id) {
        const res = await this.makeRequest(`artists/${id}/top-tracks?market=${this.market}`);
        return {
            title: `${res.tracks[0].artists.find(a => a.id === id)?.name ?? ''} Top Tracks`,
            tracks: res.tracks.map(t => this.buildTrack(t))
        };
    }
    buildTrack({ name, artists, external_urls: { spotify }, external_ids, duration_ms }) {
        const artistNames = artists.map(({ name }) => name).join(', ');
        return new UnresolvedTrack_1.default(this.vulkava, name, artistNames, duration_ms, spotify, 'spotify', external_ids?.isrc);
    }
    async makeRequest(endpoint) {
        if (!this.token || this.renewDate === 0 || Date.now() > this.renewDate)
            await this.renewToken();
        return (0, Request_1.default)(`https://api.spotify.com/v1/${endpoint}`, {
            headers: {
                Authorization: this.token,
            }
        });
    }
    async renewToken() {
        if (this.auth) {
            await this.getToken();
        }
        else {
            await this.getAnonymousToken();
        }
    }
    async getAnonymousToken() {
        const { accessToken, accessTokenExpirationTimestampMs } = await (0, Request_1.default)('https://open.spotify.com/get_access_token?reason=transport&productType=embed', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36'
            }
        });
        if (!accessToken)
            throw new Error('Failed to get anonymous token on Spotify.');
        this.token = `Bearer ${accessToken}`;
        this.renewDate = accessTokenExpirationTimestampMs - 5000;
    }
    async getToken() {
        const { token_type, access_token, expires_in } = await (0, Request_1.default)('https://accounts.spotify.com/api/token?grant_type=client_credentials', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${this.auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        this.token = `${token_type} ${access_token}`;
        this.renewDate = Date.now() + expires_in * 1000 - 5000;
    }
}
exports.default = Spotify;