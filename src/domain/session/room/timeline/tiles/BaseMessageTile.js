/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>

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

import { SimpleTile } from "./SimpleTile.js";
import { ReactionsViewModel } from "../ReactionsViewModel.js";
import { getIdentifierColorNumber, avatarInitials, getAvatarHttpUrl } from "../../../../avatar";
import { ObservableMap } from "../../../../../observable/map/ObservableMap";
import { RoomMemberTile } from "./RoomMemberTile.js";

export class BaseMessageTile extends SimpleTile {
    constructor(entry, options) {
        super(entry, options);
        this._date = this._entry.timestamp ? new Date(this._entry.timestamp) : null;
        this._isContinuation = false;
        this._isSameDay = false;
        this._isNewOwn = false;
        this._reactions = null;
        this._isReadAlready = false;
        this._threadAnchor = null;
        this._replyTile = null;
        if (this._entry.annotations || this._entry.pendingAnnotations) {
            this._updateReactions();
            this._updateThreadAnchor();
        }
        this._updateReplyTileIfNeeded(undefined);
    }

    notifyVisible() {
        super.notifyVisible();
        this._replyTile?.notifyVisible();
    }


    get _mediaRepository() {
        return this._room.mediaRepository;
    }

    get permaLink() {
        return `https://matrix.to/#/${encodeURIComponent(this._room.id)}/${encodeURIComponent(this._entry.id)}`;
    }

    get senderProfileLink() {
        return `https://matrix.to/#/${encodeURIComponent(this.sender)}`;
    }

    get displayName() {
        const res = this._entry.displayName || this.sender
        if (res.indexOf('@u_') >= 0) {
            const id = res.split(':')[0].replace('@u_', 'GG')
            return id;
        }
        return res;
    }

    get sender() {
        return this._entry.sender;
    }

    get memberPanelLink() {
        return `${this.urlCreator.urlUntilSegment("room")}/member/${this.sender}`;
    }

    get isTx() {
        if (this._entry?._eventEntry?.event?.content?.msgtype === 'm.tx') {
            return true;
        }
        return false;
    }
    get isClaim() {
        if (this._entry?._eventEntry?.event?.content?.msgtype === 'm.claim') {
            return true;
        }
        return false;
    }

    // Avatar view model contract
    get avatarColorNumber() {
        return getIdentifierColorNumber(this._entry.sender);
    }

    avatarUrl(size) {
        return getAvatarHttpUrl(this._entry.avatarUrl, size, this.platform, this._mediaRepository);
    }

    get avatarLetter() {
        return avatarInitials(this.sender);
    }

    get avatarTitle() {
        return this.displayName;
    }

    get date() {
        return this._date && this._date.toLocaleDateString('en-US', { year: 'numeric', month: "long", day: "numeric" }).split('/').join('-');
    }

    get time() {
        return this._date && this._date.toLocaleTimeString({}, { hour: "numeric", minute: "2-digit" });
    }

    get isOwn() {
        return this._entry.sender === this._ownMember.userId;
    }

    get isContinuation() {
        return this._isContinuation;
    }

    get isSameDay() {
        return this._isSameDay;
    }
    get isNewOwn() {
        return this._isNewOwn;
    }
    get isUnverified() {
        return this._entry.isUnverified;
    }

    get isReply() {
        return this._entry.isReply;
    }

    _getContent() {
        return this._entry.content;
    }

    get isReadAlreay() {
        const readData = this._room.getReadData
        return !!readData && readData > (this._entry._eventEntry?.event?.origin_server_ts || Number.MAX_SAFE_INTEGER)
    }

    updatePreviousSibling(prev) {
        super.updatePreviousSibling(prev);
        let isContinuation = false;
        if (prev && prev instanceof BaseMessageTile && prev.sender === this.sender) {
            // timestamp is null for pending events
            const myTimestamp = this._entry.timestamp;
            const otherTimestamp = prev._entry.timestamp;
            // other message was sent less than 5min ago
            isContinuation = (myTimestamp - otherTimestamp) < (5 * 60 * 1000);
        }
        if (isContinuation !== this._isContinuation) {
            this._isContinuation = isContinuation;
            this.emitChange("isContinuation");
        }
        // if (this._isReadAlready !== this._room.getReadData) {
        //     this._isReadAlready = this._room.getReadData;
        //     this.emitChange("isReadAlreay");
        // }
        if (prev && (prev instanceof BaseMessageTile || prev instanceof RoomMemberTile) && prev.date === this.date) {
            this._isSameDay = true;
            this.emitChange("isSameDay");
        }
        if (prev && prev.isOwn !== this.isOwn || !prev) {
            this._isNewOwn = true;
            this.emitChange("isNewOwn");
        }
        if (prev?.isOwn === true && this?.isOwn === true) {
            isContinuation = true
        }
    }

    updateEntry(entry, param) {
        const action = super.updateEntry(entry, param);
        if (action.shouldUpdate) {
            this._updateReactions();
            this._updateThreadAnchor();
        }
        this._updateReplyTileIfNeeded(param);
        return action;
    }

    _updateReplyTileIfNeeded(param) {
        const replyEntry = this._entry.contextEntry;
        if (replyEntry) {
            // this is an update to contextEntry used for replyPreview
            const action = this._replyTile?.updateEntry(replyEntry, param);
            if (action?.shouldReplace || !this._replyTile) {
                this.disposeTracked(this._replyTile);
                const tileClassForEntry = this._options.tileClassForEntry;
                const ReplyTile = tileClassForEntry(replyEntry);
                if (ReplyTile) {
                    this._replyTile = new ReplyTile(replyEntry, this._options);
                }
            }
            if (action?.shouldUpdate) {
                this._replyTile?.emitChange();
            }
        }
    }

    startReply() {
        this._roomVM.startReply(this._entry);
    }

    reply(msgtype, body, log = null) {
        return this._room.sendEvent("m.room.message", this._entry.reply(msgtype, body), null, log);
    }

    redact(reason, log) {
        return this._room.sendRedaction(this._entry.id, reason, log);
    }

    get canRedact() {
        return this._powerLevels.canRedactFromSender(this._entry.sender);
    }

    get reactions() {
        if (this.shape !== "redacted") {
            return this._reactions;
        }
        return null;
    }
    get threadAnchor() {
        if (this.shape !== "redacted") {
            return this._threadAnchor;
        }
        return null;
    }

    get canReact() {
        return this._powerLevels.canSendType("m.reaction");
    }

    react(key, log = null) {
        return this.logger.wrapOrRun(log, "react", async log => {
            if (!this.canReact) {
                log.set("powerlevel_lacking", true);
                return;
            }
            if (this._entry.haveAnnotation(key)) {
                log.set("already_reacted", true);
                return;
            }
            const redaction = this._entry.pendingAnnotations?.get(key)?.redactionEntry;
            if (redaction && !redaction.pendingEvent.hasStartedSending) {
                log.set("abort_redaction", true);
                await redaction.pendingEvent.abort();
            } else {
                await this._room.sendEvent("m.reaction", this._entry.annotate(key), null, log);
            }
        });
    }

    redactReaction(key, log = null) {
        return this.logger.wrapOrRun(log, "redactReaction", async log => {
            if (!this._powerLevels.canRedactFromSender(this._ownMember.userId)) {
                log.set("powerlevel_lacking", true);
                return;
            }
            if (!this._entry.haveAnnotation(key)) {
                log.set("not_yet_reacted", true);
                return;
            }
            let entry = this._entry.pendingAnnotations?.get(key)?.annotationEntry;
            if (!entry) {
                entry = await this._timeline.getOwnAnnotationEntry(this._entry.id, key);
            }
            if (entry) {
                await this._room.sendRedaction(entry.id, null, log);
            } else {
                log.set("no_reaction", true);
            }
        });
    }

    toggleReaction(key, log = null) {
        return this.logger.wrapOrRun(log, "toggleReaction", async log => {
            if (this._entry.haveAnnotation(key)) {
                await this.redactReaction(key, log);
            } else {
                await this.react(key, log);
            }
        });
    }

    _updateReactions() {
        const { annotations, pendingAnnotations } = this._entry;
        if (!annotations && !pendingAnnotations) {
            if (this._reactions) {
                this._reactions = null;
            }
        } else {
            if (!this._reactions) {
                this._reactions = new ReactionsViewModel(this);
            }
            this._reactions.update(annotations, pendingAnnotations);
        }
    }
    _updateThreadAnchor() {
        const { annotations } = this._entry;
        if (!annotations) return
        const threadKey = Object.keys(annotations).find(k => k.startsWith('thrd'))
        if (threadKey) {
            this._threadAnchor = threadKey;
        }
    }

    get replyTile() {
        if (!this._entry.contextEventId) {
            return null;
        }
        return this._replyTile;
    }
}
