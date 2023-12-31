"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deezer = void 0;
const { Manager, Plugin, TrackUtils } = require("erela.js");
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'https://api.deezer.com';
const REGEX = /^(?:https?:\/\/|)?(?:www\.)?deezer\.com\/(?:\w{2}\/)?(track|album|playlist)\/(\d+)/;
const buildSearch = (loadType, tracks, error, name) => ({
    loadType: loadType,
    tracks: tracks !== null && tracks !== void 0 ? tracks : [],
    playlist: name ? {
        name,
        duration: tracks
            .reduce((acc, cur) => acc + (cur.duration || 0), 0),
    } : null,
    exception: error ? {
        message: error,
        severity: "COMMON"
    } : null,
});
const check = (options) => {
    if (typeof options.convertUnresolved !== "undefined" &&
        typeof options.convertUnresolved !== "boolean")
        throw new TypeError('Deezer option "convertUnresolved" must be a boolean.');
    if (typeof options.playlistLimit !== "undefined" &&
        typeof options.playlistLimit !== "number")
        throw new TypeError('Deezer option "playlistLimit" must be a number.');
    if (typeof options.albumLimit !== "undefined" &&
        typeof options.albumLimit !== "number")
        throw new TypeError('Deezer option "albumLimit" must be a number.');
};
class Deezer extends Plugin {
    constructor(options = {}) {
        super();
        check(options);

        const defaultOptions = {
            playlistLimit: 0,
            albumLimit: 0,
            convertUnresolved: false
        };
        const FUNCTIONS = {
            track: this.getTrack.bind(this),
            album: this.getAlbumTracks.bind(this),
            playlist: this.getPlaylistTracks.bind(this),
        };
        this.querySource = options.querySource && Array.isArray(options.querySource) ? options.querySource : ["deezer", "dz"];

        Object.defineProperty(this, 'functions', { value: FUNCTIONS });
        Object.defineProperty(this, 'options', { value: Object.assign(defaultOptions, options) });
    };
    load(manager) {
        this.manager = manager;
        this._search = manager.search.bind(manager);
        manager.search = this.search.bind(this);
    }
    search(query, requester) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            const finalQuery = query.query || query;
            if(typeof query === "object" && query.source && (this.querySource.includes(query.source))) {
                const tracks = yield this.searchQuery(finalQuery)
                if(tracks && tracks.length) return buildSearch("TRACK_LOADED", tracks.map(query => {
                    const track = TrackUtils.buildUnresolved(query, requester);
                    if (this.options.convertUnresolved) track.resolve();
                    return track;
                }), null, null);
            }
            const [, type, id] = (_a = finalQuery.match(REGEX)) !== null && _a !== void 0 ? _a : [];
            if (type in this.functions) {
                try {
                    const func = this.functions[type];
                    if (func) {
                        const data = yield func(id);
                        const loadType = type === "track" ? "TRACK_LOADED" : "PLAYLIST_LOADED";
                        const name = ["playlist", "album"].includes(type) ? data.name : null;
                        if(!data || !data.tracks || !data.tracks[0]) return buildSearch('NO_MATCHES', null, null, null);
                        const tracks = data.tracks.map(query => {
                            const track = TrackUtils.buildUnresolved(query, requester);
                            if (this.options.convertUnresolved) track.resolve();
                            return track;
                        });
                        return buildSearch(loadType, tracks, null, name);
                    }
                    const msg = 'Incorrect type for Deezer URL, must be one of "track", "album" or "playlist".';
                    return buildSearch("LOAD_FAILED", null, msg, null);
                } catch (e) {
                    return buildSearch((_b = e.loadType) !== null && _b !== void 0 ? _b : "LOAD_FAILED", null, (_c = e.message) !== null && _c !== void 0 ? _c : null, null);
                };
            };
            return this._search(query, requester);
        });
    };
    searchQuery(query) {
        return __awaiter(this, void 0, void 0, function* () { // https://api.deezer.com/search/track?q=eminem
            const { data: response } = yield axios_1.default.get(`${BASE_URL}/search/track?q=${encodeURIComponent(query)}`).catch(() => { });
            if(!response) return [];
            const tracks = response?.data?.map?.(item => Deezer.convertToUnresolved(item));
            return tracks || [];
        });
    };
    getAlbumTracks(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: album } = yield axios_1.default.get(`${BASE_URL}/album/${id}`);
            const tracks = album.tracks.data.map(item => Deezer.convertToUnresolved(item));
            return { tracks: this.options.albumLimit <= 0 ? tracks : tracks.splice(0, this.options.albumLimit), name: album.title };
        });
    };
    getPlaylistTracks(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: playlist } = yield axios_1.default.get(`${BASE_URL}/playlist/${id}`);
            const tracks = playlist.tracks.data.map(item => Deezer.convertToUnresolved(item));
            return { tracks: this.options.playlistLimit <= 0 ? tracks : tracks.splice(0, this.options.playlistLimit), name: playlist.title };
        });
    };
    getTrack(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield axios_1.default.get(`${BASE_URL}/track/${id}`);
            const track = Deezer.convertToUnresolved(data);
            return { tracks: [track] };
        });
    };
    static convertToUnresolved(track) {
        if (!track) throw new ReferenceError("The Deezer track object was not provided");
        if (!track.artist) throw new ReferenceError("The track artist array was not provided");
        if (!track.title) throw new ReferenceError("The track title was not provided");
        if (typeof track.title !== "string") throw new TypeError(`The track title must be a string, received type ${typeof track.name}`);
        return {
            identifier: track.id ? `${track.id}` : undefined,
            uri: track.link ?? track.id ? `https://deezer.com/track/${track.id}` : undefined,
            thumbnail: track.md5_image ? `https://e-cdn-images.dzcdn.net/images/cover/${track.md5_image}/264x264-000000-80-0-0.jpg` : undefined,
            preview: track.preview ? `${track.preview}` : undefined,
            author: track.artist ? `${track.artist.name}` : undefined,
            title: track.title ? `${track.title}` : track.title_short ? `${track.title_short}` : "Unknown Title",
            duration: track.duration * 1000,
        };
    };
};
exports.Deezer = Deezer;
