/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>
Copyright 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { TimelineViewModel } from "./timeline/TimelineViewModel.js";
import { ComposerViewModel } from "./ComposerViewModel.js"
import { avatarInitials, getIdentifierColorNumber, getAvatarHttpUrl } from "../../avatar";
import { ViewModel } from "../../ViewModel";
import { imageToInfo } from "../common.js";
// TODO: remove fallback so default isn't included in bundle for SDK users that have their custom tileClassForEntry
// this is a breaking SDK change though to make this option mandatory
import { tileClassForEntry as defaultTileClassForEntry } from "./timeline/tiles/index";
import { PINNED_MESSAGE_TYPE, RoomStatus } from "../../../matrix/room/common";
import { BlobHandle } from "../../../platform/web/dom/BlobHandle.js";

export class RoomViewModel extends ViewModel {
    constructor(options) {
        super(options);
        const { room, tileClassForEntry } = options;
        this._room = room;
        this._timelineVM = null;
        this._tileClassForEntry = tileClassForEntry ?? defaultTileClassForEntry;
        this._tileOptions = undefined;
        this._onRoomChange = this._onRoomChange.bind(this);
        this._timelineError = null;
        this._sendError = null;
        this._composerVM = null;
        if (room.isArchived) {
            this._composerVM = this.track(new ArchivedViewModel(this.childOptions({ archivedRoom: room })));
        } else {
            this._recreateComposerOnPowerLevelChange();
        }
        this._clearUnreadTimout = null;
        this._closeUrl = this.urlCreator.urlUntilSegment("session");
    }

    async load() {
        this._room.on("change", this._onRoomChange);
        try {
            const timeline = await this._room.openTimeline();
            this._tileOptions = this.childOptions({
                roomVM: this,
                timeline,
                tileClassForEntry: this._tileClassForEntry,
            });
            this._timelineVM = this.track(new TimelineViewModel(this.childOptions({
                tileOptions: this._tileOptions,
                timeline,
            })));
            this.emitChange("timelineViewModel");
        } catch (err) {
            console.error(`room.openTimeline(): ${err.message}:\n${err.stack}`);
            this._timelineError = err;
            this.emitChange("error");
        }
        this._clearUnreadAfterDelay();
    }

    async _recreateComposerOnPowerLevelChange() {
        const powerLevelObservable = await this._room.observePowerLevels();
        const canSendMessage = () => powerLevelObservable.get().canSendType("m.room.message");
        let oldCanSendMessage = canSendMessage();
        const recreateComposer = newCanSendMessage => {
            this._composerVM = this.disposeTracked(this._composerVM);
            if (newCanSendMessage) {
                this._composerVM = this.track(new ComposerViewModel(this));
            }
            else {
                this._composerVM = this.track(new LowerPowerLevelViewModel(this.childOptions()));
            }
            this.emitChange("powerLevelObservable")
        };
        this.track(powerLevelObservable.subscribe(() => {
            const newCanSendMessage = canSendMessage();
            if (oldCanSendMessage !== newCanSendMessage) {
                recreateComposer(newCanSendMessage);
                oldCanSendMessage = newCanSendMessage;
            }
        }));
        recreateComposer(oldCanSendMessage);
    }

    uploadTyping() {
        if (this._room.isArchived) {
            return;
        }
        this._room.markTyping();
    }

    async _clearUnreadAfterDelay() {
        if (this._room.isArchived || this._clearUnreadTimout) {
            return;
        }
        this._clearUnreadTimout = this.clock.createTimeout(100);
        try {
            await this._clearUnreadTimout.elapsed();
            await this._room.clearUnread();
            this._clearUnreadTimout = null;
        } catch (err) {
            if (err.name !== "AbortError") {
                throw err;
            }
        }
    }

    focus() {
        this._clearUnreadAfterDelay();
    }

    dispose() {
        super.dispose();
        this._room.off("change", this._onRoomChange);
        if (this._room.isArchived) {
            this._room.release();
        }
        if (this._clearUnreadTimout) {
            this._clearUnreadTimout.abort();
            this._clearUnreadTimout = null;
        }
    }

    // room doesn't tell us yet which fields changed,
    // so emit all fields originating from summary
    _onRoomChange() {
        // propagate the update to the child view models so it's bindings can update based on room changes
        this._composerVM.emitChange();
        this.emitChange();
    }

    get kind() { return "room"; }
    get closeUrl() { return this._closeUrl; }
    get name() { return this._room.name || this.i18n`Empty Room`; }
    get id() { return this._room.id; }
    get timelineViewModel() { return this._timelineVM; }
    get isEncrypted() { return this._room.isEncrypted; }

    get error() {
        if (this._timelineError) {
            return `Something went wrong loading the timeline: ${this._timelineError.message}`;
        }
        if (this._sendError) {
            return `Something went wrong sending your message: ${this._sendError.message}`;
        }
        return "";
    }

    get avatarLetter() {
        return avatarInitials(this.name);
    }

    get avatarColorNumber() {
        return getIdentifierColorNumber(this._room.avatarColorId)
    }

    avatarUrl(size) {
        return getAvatarHttpUrl(this._room.avatarUrl, size, this.platform, this._room.mediaRepository);
    }

    get avatarTitle() {
        return this.name;
    }

    get canLeave() {
        return this._room.isJoined;
    }

    leaveRoom() {
        this._room.leave();
    }

    get canForget() {
        return this._room.isArchived;
    }

    forgetRoom() {
        this._room.forget();
    }

    get canRejoin() {
        return this._room.isArchived;
    }

    rejoinRoom() {
        this._room.join();
    }

    _createTile(entry) {
        if (this._tileOptions) {
            const Tile = this._tileOptions.tileClassForEntry(entry);
            if (Tile) {
                return new Tile(entry, this._tileOptions);
            }
        }
    }

    async _processCommandJoin(roomName) {
        try {
            const roomId = await this._options.client.session.joinRoom(roomName);
            const roomStatusObserver = await this._options.client.session.observeRoomStatus(roomId);
            await roomStatusObserver.waitFor(status => status === RoomStatus.Joined);
            this.navigation.push("room", roomId);
        } catch (err) {
            let exc;
            if ((err.statusCode ?? err.status) === 400) {
                exc = new Error(`/join : '${roomName}' was not legal room ID or room alias`);
            } else if ((err.statusCode ?? err.status) === 404 || (err.statusCode ?? err.status) === 502 || err.message == "Internal Server Error") {
                exc = new Error(`/join : room '${roomName}' not found`);
            } else if ((err.statusCode ?? err.status) === 403) {
                exc = new Error(`/join : you're not invited to join '${roomName}'`);
            } else {
                exc = err;
            }
            this._sendError = exc;
            this._timelineError = null;
            this.emitChange("error");
        }
    }

    async _processCommand(message) {
        let msgtype;
        const [commandName, ...args] = message.substring(1).split(" ");
        switch (commandName) {
            case "me":
                message = args.join(" ");
                msgtype = "m.emote";
                break;
            case "join":
                if (args.length === 1) {
                    const roomName = args[0];
                    await this._processCommandJoin(roomName);
                } else {
                    this._sendError = new Error("join syntax: /join <room-id>");
                    this._timelineError = null;
                    this.emitChange("error");
                }
                break;
            case "shrug":
                message = "¯\\_(ツ)_/¯ " + args.join(" ");
                msgtype = "m.text";
                break;
            case "tableflip":
                message = "(╯°□°）╯︵ ┻━┻ " + args.join(" ");
                msgtype = "m.text";
                break;
            case "unflip":
                message = "┬──┬ ノ( ゜-゜ノ) " + args.join(" ");
                msgtype = "m.text";
                break;
            case "lenny":
                message = "( ͡° ͜ʖ ͡°) " + args.join(" ");
                msgtype = "m.text";
                break;
            default:
                this._sendError = new Error(`no command name "${commandName}". To send the message instead of executing, please type "/${message}"`);
                this._timelineError = null;
                this.emitChange("error");
                message = undefined;
        }
        return { type: msgtype, message: message };
    }

    async loadEventsFromServer(eventId) {
        const r = await this._timelineVM._options.room.loadEventsFromServer(eventId)
        return r;
    }
    async searchTextLocal(textContent) {
        const loadAndFindUtilRes = await this._timelineVM._timeline.searchEventByTextLocal(textContent)
        return loadAndFindUtilRes
    }
    async searchTextServer(textContent) {
        await this._timelineVM._options.room.loadEventsFromServer()
        const loadAndFindUtilRes = await this._timelineVM._timeline.searchEventByTextLocal(textContent)
        return loadAndFindUtilRes
    }
    async loadAroundEventById(eventId) {
        await this._timelineVM._timeline.searchAroundEvents(eventId)
    }
    async loadUtilEvent(eventId) {
        // search 
        const loadAndFindUtilRes = await this._timelineVM._timeline.searchEventUtil(eventId)
        if (loadAndFindUtilRes.found) {
            return true
            // scroll to the event
        } else {
            await this.loadEventsFromServer(eventId)
            const loadAndFindUtilRes2 = await this._timelineVM._timeline.searchEventUtil(eventId)
            return !!loadAndFindUtilRes2.found
        }
    }
    async _setPinnedMessage(eventId) {
        // const resSearch = await this.loadUtilEvent("$xf2vDOy0xZJ-Ex_mAO5RVQtc0grUFh31zWqVX56qY5M")
        // // const resSearch = await this.searchTextServer('22')
        if (!this._room.isArchived && eventId) {
            try {
                await this.updatePinnedMessage()
                const exists = await this._room.loadStateFromIDB(PINNED_MESSAGE_TYPE)
                if (exists?.event?.content?.pinned?.length > 0) {
                    const oldEvents = new Set(exists?.event?.content?.pinned)
                    if (oldEvents.has(eventId)) {
                        oldEvents.delete(eventId)
                    } else {
                        oldEvents.add(eventId)
                    }
                    await this._room.setState(PINNED_MESSAGE_TYPE, '', { pinned: [...oldEvents] });
                } else {
                    await this._room.setState(PINNED_MESSAGE_TYPE, '', { pinned: [eventId] });
                }
                return true;
            } catch (err) {
                console.error(`room.setPinnedMessage(): ${err.message}:\n${err.stack}`);
                this._sendError = err;
                this._timelineError = null;
                this.emitChange("error");
                return false;
            }
        }
    }
    async getEventsDataByIds(idList) {
        if (idList.length > 0) {
            return await this._room.checkAndLoadEvents(idList)
        }
    }
    async updatePinnedMessage() {
        if (!this._room.isArchived) {
            const res = await this._room.getState(PINNED_MESSAGE_TYPE, '');
            return res
        }
    }
    async checkSDKWorkingStatus() {
        if (this._room.isArchived) {
            return false;
        }
        try {
            const testLastEventId = await this._room._getLastEventId()
            if (!testLastEventId) {
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }
    async _sendMessage(message, replyingTo) {
        if (!this._room.isArchived && message) {
            let messinfo = { type: "m.text", message: message };
            if (message.startsWith("//")) {
                messinfo.message = message.substring(1).trim();
            } else if (message.startsWith("/")) {
                messinfo = await this._processCommand(message);
            }
            try {
                const msgtype = messinfo.type;
                const message = messinfo.message;
                if (msgtype && message) {
                    if (replyingTo) {
                        await replyingTo.reply(msgtype, message);
                    } else {
                        const res = await this._room.sendEvent("m.room.message", { msgtype, body: message });
                        return res
                    }
                }
            } catch (err) {
                console.error(`room.sendMessage(): ${err.message}:\n${err.stack}`);
                this._sendError = err;
                this._timelineError = null;
                this.emitChange("error");
                return false;
            }
            return true;
        }
        return false;
    }
    async _sendTxMessage(message) {
        // { txHash: 'dsadasd', type: 1, tokenData: IToken, message: 'hello', value: '0.213BTC' }
        if (!this._room.isArchived && message) {
            let messinfo = { ...message, msgtype: "m.tx", body: message.message };
            try {
                const res = await this._room.sendEvent("m.room.message", { ...messinfo });
                return res
            } catch (err) {
                console.error(`room._sendTxMessage(): ${err.message}:\n${err.stack}`);
                this._sendError = err;
                this._timelineError = null;
                this.emitChange("error");
                return false;
            }
        }
        return false;
    }
    async _sendClaimMessage(message) {
        if (!this._room.isArchived && message) {
            let messinfo = { ...message, msgtype: "m.claim", body: message.message };
            try {
                const res = await this._room.sendEvent("m.room.message", { ...messinfo });
                return res
            } catch (err) {
                console.error(`room._sendTxMessage(): ${err.message}:\n${err.stack}`);
                this._sendError = err;
                this._timelineError = null;
                this.emitChange("error");
                return false;
            }
        }
        return false;
    }

    async _pickAndSendFile(event) {
        try {
            const file = await this.platform.openFile();
            if (!file) {
                return;
            }
            console.log('file.blob.mimeType:', file, file.blob.mimeType)
            const aatachmentMaxSize = 50 * 1024 * 1024;
            if (file.blob.size > aatachmentMaxSize) {
                event.videoOversized = true
                event?.videoOversizedAlert?.()
                return
            }
            const rightFileType = file.blob.mimeType.includes('xml') || file.blob.mimeType.includes('text/plain') ||
                file.blob.mimeType.includes('word') || file.blob.mimeType.includes('pdf') ||
                file.blob.mimeType.includes('powerpoint') || file.blob.mimeType.includes('officedocument') ||
                file.blob.mimeType.includes('excel')
            if (!rightFileType) {
                event?.videoTypeUnsupport?.()
                return
            }
            event.attachSent = true
            return this._sendFile(file);
        } catch (err) {
            console.error(err);
        }
    }

    async _sendFile(file) {
        const content = {
            body: file.name,
            msgtype: "m.file"
        };
        await this._room.sendEvent("m.room.message", content, {
            "url": this._room.createAttachment(file.blob, file.name)
        });
    }

    async _pickAndSendVideo(event) {
        try {
            if (!this.platform.hasReadPixelPermission()) {
                alert("Please allow canvas image data access, so we can scale your images down.");
                return;
            }
            const file = await this.platform.openFile("video/*");
            if (!file) {
                return;
            }
            if (!file.blob.mimeType.startsWith("video/")) {
                return this._sendFile(file);
            }
            let video;
            try {
                video = await this.platform.loadVideo(file.blob);
            } catch (err) {
                // TODO: extract platform dependent code from view model
                if (err instanceof window.MediaError && err.code === 4) {
                    throw new Error(`this browser does not support videos of type ${file?.blob.mimeType}.`);
                } else {
                    throw err;
                }
            }
            const content = {
                body: file.name,
                msgtype: "m.video",
                info: videoToInfo(video)
            };
            const attachments = {
                "url": this._room.createAttachment(video.blob, file.name),
            };

            const limit = await this.platform.settingsStorage.getInt("sentImageSizeLimit");
            const maxDimension = limit || Math.min(video.maxDimension, 800);
            const thumbnail = await video.scale(maxDimension);
            content.info.thumbnail_info = imageToInfo(thumbnail);
            attachments["info.thumbnail_url"] =
                this._room.createAttachment(thumbnail.blob, file.name);
            await this._room.sendEvent("m.room.message", content, attachments);
        } catch (err) {
            this._sendError = err;
            this.emitChange("error");
            console.error(err.stack);
        }
    }

    async _pickAndSendPicture(event) {
        try {
            if (!this.platform.hasReadPixelPermission()) {
                alert("Please allow canvas image data access, so we can scale your images down.");
                return;
            }
            const file = await this.platform.openFile("image/*, video/*");
            if (!file) {
                return;
            }
            if (!file.blob.mimeType.startsWith("image/") && !file.blob.mimeType.startsWith("video/")) {
                return this._sendFile(file);
            }
            if (file.blob.mimeType.startsWith("image/")) {
                let image = await this.platform.loadImage(file.blob);
                // const limit = await this.platform.settingsStorage.getInt("sentImageSizeLimit") || 1600;
                const limit = 1 * 1024 * 1024
                if (image.maxFileSizeLimitaion > limit) {
                    const compressRatio = limit / image.maxFileSizeLimitaion
                    const compressRatioReal = Number(Math.sqrt(compressRatio).toFixed(2))
                    const scaledImage = await image.scale2(compressRatioReal);
                    image.dispose();
                    image = scaledImage;
                }
                const content = {
                    body: file.name,
                    msgtype: "m.image",
                    info: imageToInfo(image)
                };
                const attachments = {
                    "url": this._room.createAttachment(image.blob, file.name),
                };
                if (image.maxDimension > 600) {
                    const thumbnail = await image.scale(400);
                    content.info.thumbnail_info = imageToInfo(thumbnail);
                    attachments["info.thumbnail_url"] =
                        this._room.createAttachment(thumbnail.blob, file.name);
                }
                await this._room.sendEvent("m.room.message", content, attachments);
                event.attachSent = true
            } else if (file.blob.mimeType.startsWith("video/")) {
                let video;
                if ((file.blob.mimeType || '').toLowerCase() === 'video/avi') {
                    event?.videoTypeUnsupport?.()
                    return
                }
                try {
                    video = await this.platform.loadVideo(file.blob);
                } catch (err) {
                    // TODO: extract platform dependent code from view model
                    if (err instanceof window.MediaError && err.code === 4) {
                        throw new Error(`this browser does not support videos of type ${file?.blob.mimeType}.`);
                    } else {
                        throw err;
                    }
                }
                const videoMaxSize = 50 * 1024 * 1024;
                if (video.maxFileSizeLimitaion > videoMaxSize) {
                    event.videoOversized = true
                    event?.videoOversizedAlert?.()
                } else {
                    const content = {
                        body: file.name,
                        msgtype: "m.video",
                        info: videoToInfo(video)
                    };
                    const attachments = {
                        "url": this._room.createAttachment(video.blob, file.name),
                    };
                    const maxDimension = 800;
                    const thumbnail = await video.scale(maxDimension);
                    content.info.thumbnail_info = imageToInfo(thumbnail);
                    attachments["info.thumbnail_url"] =
                        this._room.createAttachment(thumbnail.blob, file.name);
                    await this._room.sendEvent("m.room.message", content, attachments);
                }
            }
        } catch (err) {
            this._sendError = err;
            this.emitChange("error");
            console.error(err.stack);
        }
    }
    async _pickAndSendPictureByPaste(filepre) {
        try {
            if (!this.platform.hasReadPixelPermission()) {
                alert("Please allow canvas image data access, so we can scale your images down.");
                return;
            }
            const file = { name: filepre.name, blob: BlobHandle.fromBlob(filepre) };
            // const file = await this.platform.openFile("image/*");
            if (!file) {
                return;
            }
            if (!file.blob.mimeType.startsWith("image/")) {
                return this._sendFile(file);
            }
            let image = await this.platform.loadImage(file.blob);
            // const limit = await this.platform.settingsStorage.getInt("sentImageSizeLimit") || 1600;
            const limit = 1 * 1024 * 1024
            if (image.maxFileSizeLimitaion > limit) {
                const compressRatio = limit / image.maxFileSizeLimitaion
                const compressRatioReal = Number(Math.sqrt(compressRatio).toFixed(2))
                const scaledImage = await image.scale2(compressRatioReal);
                image.dispose();
                image = scaledImage;
            }
            const content = {
                body: file.name,
                msgtype: "m.image",
                info: imageToInfo(image)
            };
            const attachments = {
                "url": this._room.createAttachment(image.blob, file.name),
            };
            if (image.maxDimension > 600) {
                const thumbnail = await image.scale(400);
                content.info.thumbnail_info = imageToInfo(thumbnail);
                attachments["info.thumbnail_url"] =
                    this._room.createAttachment(thumbnail.blob, file.name);
            }
            await this._room.sendEvent("m.room.message", content, attachments);
            // event.attachSent = true
        } catch (err) {
            this._sendError = err;
            this.emitChange("error");
            console.error(err.stack);
        }
    }

    get room() {
        return this._room;
    }

    get composerViewModel() {
        return this._composerVM;
    }

    openDetailsPanel() {
        let path = this.navigation.path.until("room");
        path = path.with(this.navigation.segment("right-panel", true));
        path = path.with(this.navigation.segment("details", true));
        this.navigation.applyPath(path);
    }

    startReply(entry) {
        if (!this._room.isArchived) {
            this._composerVM.setReplyingTo(entry);
        }
    }

    dismissError() {
        this._sendError = null;
        this.emitChange("error");
    }
}

function videoToInfo(video) {
    const info = imageToInfo(video);
    info.duration = video.duration;
    return info;
}

class ArchivedViewModel extends ViewModel {
    constructor(options) {
        super(options);
        this._archivedRoom = options.archivedRoom;
    }

    get description() {
        if (this._archivedRoom.isKicked) {
            if (this._archivedRoom.kickReason) {
                return this.i18n`You were kicked from the room by ${this._archivedRoom.kickedBy.name} because: ${this._archivedRoom.kickReason}`;
            } else {
                return this.i18n`You were kicked from the room by ${this._archivedRoom.kickedBy.name}.`;
            }
        } else if (this._archivedRoom.isBanned) {
            if (this._archivedRoom.kickReason) {
                return this.i18n`You were banned from the room by ${this._archivedRoom.kickedBy.name} because: ${this._archivedRoom.kickReason}`;
            } else {
                return this.i18n`You were banned from the room by ${this._archivedRoom.kickedBy.name}.`;
            }
        } else {
            return this.i18n`You left this room`;
        }
    }

    get kind() {
        return "disabled";
    }
}

class LowerPowerLevelViewModel extends ViewModel {
    get description() {
        return this.i18n`You do not have the powerlevel necessary to send messages`;
    }

    get kind() {
        return "disabled";
    }
}
