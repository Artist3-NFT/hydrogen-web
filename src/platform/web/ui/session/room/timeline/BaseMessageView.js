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
import { renderStaticAvatar } from "../../../avatar";
import { tag } from "../../../general/html";
import { mountView } from "../../../general/utils";
import { TemplateView } from "../../../general/TemplateView";
import { Popup } from "../../../general/Popup.js";
import { Menu } from "../../../general/Menu.js";
import { ReactionsView } from "./ReactionsView.js";

export class BaseMessageView extends TemplateView {
    constructor(value, viewClassForTile, renderFlags, tagName = "li") {
        super(value);
        this._menuPopup = null;
        this._tagName = tagName;
        this._viewClassForTile = viewClassForTile;
        // TODO An enum could be nice to make code easier to read at call sites.
        this._renderFlags = renderFlags;
    }

    get _interactive() { return this._renderFlags?.interactive ?? true; }
    get _isReplyPreview() { return this._renderFlags?.reply; }

    render(t, vm) {
        const children = [this.renderMessageBody(t, vm)];
        let dropDownAnchor = null
        if (vm.shape !== "redacted") {
            dropDownAnchor = t.div({ className: 'Timeline_messageOptions3', onClick: (e) => this._toggleMenuMore(e.target, vm) });
            children.push(dropDownAnchor);
        }
        var timer
        const li = t.el(this._tagName, {
            className: {
                "Timeline_message": true,
                own: vm.isOwn,
                newDay: !vm.isSameDay,
                unsent: vm.isUnsent,
                unverified: vm.isUnverified,
                disabled: !this._interactive,
                haveThread: !!vm.threadAnchor,
                messageDeleted: vm.shape === "redacted",
                continuation: vm => vm.isContinuation,
                replyingContainer: vm => vm.isReply,
                newOwn: vm => vm.isNewOwn,
            },
            ontouchmove: () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            },
            ontouchstart: (e) => {
                if (!timer) {
                    timer = setTimeout(() => {
                        this._toggleMenuMore(dropDownAnchor, vm)
                    }, 600);
                }
            },
            ontouchend: () => {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            },
            oncontextmenu: (e) => {
                e?.preventDefault();
                e?.stopPropagation();
                this._toggleMenuMore(dropDownAnchor, vm)
                return false
            },
            'data-event-id': vm.eventId
        }, children);
        // given that there can be many tiles, we don't add
        // unneeded DOM nodes in case of a continuation, and we add it
        // with a side-effect binding to not have to create sub views,
        // as the avatar or sender doesn't need any bindings or event handlers.
        // don't use `t` from within the side-effect callback
        t.mapSideEffect(vm => vm.isContinuation, (isContinuation, wasContinuation) => {
            if (isContinuation && wasContinuation === false) {
                li.removeChild(li.querySelector(".Timeline_messageAvatar"));
                li.removeChild(li.querySelector(".Timeline_messageSender"));
            } else if (!isContinuation && !this._isReplyPreview) {
                const avatar = tag.div({ 'data-href': vm.memberPanelLink, className: "Timeline_messageAvatar" }, [renderStaticAvatar(vm, 40)]);
                const sender = tag.div({ className: `Timeline_messageSender usercolor${vm.avatarColorNumber}` }, vm.displayName);
                li.insertBefore(avatar, li.firstChild);
                li.insertBefore(sender, li.firstChild);
            }
        });
        const timeContainer = t.time({ className: { timeReactContainer: true } });

        // similarly, we could do this with a simple ifView,
        // but that adds a comment node to all messages without reactions
        let reactionsView = null;
        const time = t.time({ className: { hidden: !vm.time } }, vm.time);
        t.mapSideEffect(vm => vm.reactions, reactions => {
            if (reactions && this._interactive && !reactionsView) {
                reactionsView = new ReactionsView(reactions);
                this.addSubView(reactionsView);
                while (timeContainer.firstChild) {
                    timeContainer.removeChild(timeContainer.firstChild);
                }
                timeContainer.appendChild(mountView(reactionsView));
                timeContainer.appendChild(time)
            } else if (!reactions) {
                if (reactionsView) {
                    timeContainer.removeChild(reactionsView.root());
                    reactionsView.unmount();
                    this.removeSubView(reactionsView);
                    reactionsView = null;
                }
                while (timeContainer.firstChild) {
                    timeContainer.removeChild(timeContainer.firstChild);
                }
                const timeBlock = t.div({ className: 'flex-1' });
                timeContainer.appendChild(timeBlock)
                timeContainer.appendChild(time)
            }
        });

        li.appendChild(timeContainer)

        t.mapSideEffect(vm => vm.threadAnchor, threadAnchor => {
            if (threadAnchor) {
                const threadLabel = t.div({ className: 'thread-label', 'data-ithread': threadAnchor }, 'Open thread');
                li.appendChild(threadLabel);
                if (!li.classList.contains('haveThread')) {
                    li.classList.add('haveThread')
                }
            }
        })
        const timeTitle = t.div({ className: { hidden: !vm.date, timeTitle: true } });
        const timeTitleTimer = t.time({ className: {} }, vm.date);
        timeTitle.appendChild(timeTitleTimer)
        li.appendChild(timeTitle)

        return li;
    }

    /* This is called by the parent ListView, which just has 1 listener for the whole list */
    onClick(evt) {
        if (evt.target.className === "Timeline_messageOptions") {
            this._toggleMenu(evt.target);
        }
    }

    _toggleMenu(button) {
        if (this._menuPopup && this._menuPopup.isOpen) {
            this._menuPopup.close();
        } else {
            const options = this.createMenuOptions(this.value, button);
            if (!options.length) {
                return;
            }
            this.root().classList.add("menuOpen");
            const onClose = () => this.root().classList.remove("menuOpen");
            this._menuPopup = new Popup(new Menu(options, 'msg-hover'), onClose);
            this._menuPopup.trackInTemplateView(this);
            this._menuPopup.showRelativeTo(button, 2);
        }
    }
    _toggleEmojiMenu(button, vm) {
        const options = [];
        options.push(new QuickReactionsMenuOption(vm))
        this.root().classList.add("menuOpen");
        const onClose = () => this.root().classList.remove("menuOpen");
        this._menuPopup = new Popup(new Menu(options, 'msg-hover'), onClose);
        this._menuPopup.trackInTemplateView(this);
        this._menuPopup.showRelativeTo(button, 2);
    }
    _toggleMenuMore(button, vm) {
        const options = [];
        options.push(Menu.option(vm.i18n`Pin message`, () => { }).setIcon('msg-menu-more-pin').setData(`${vm.sender}`));
        if (!vm.isOwn) {
            options.push(Menu.option(vm.i18n`Message user`, () => { }).setIcon('msg-menu-more-msg').setData(`${vm.sender}`));
        }
        options.push(Menu.option(vm.i18n`Reply`, () => vm.startReply()).setIcon('msg-menu-more-reply'));
        options.push(Menu.option(vm.i18n`Add reaction`, () => this._toggleEmojiMenu(button, vm)).setIcon('msg-menu-more-emoji'));
        if (!vm.threadAnchor && vm._getContent().msgtype === 'm.text') {
            options.push(Menu.option(vm.i18n`Create thread`, (e) => {
                e.sendReact = (threadId) => vm.react(threadId)
                e.eventId = vm.eventId
                e.userId = vm.sender
                e.content = vm._getContent()
            }).setIcon('msg-menu-more-thread').setData(`${vm.sender}`));
        }
        if (vm._format === 'Plain' || vm._format === 'Html') {
            options.push(Menu.option(vm.i18n`Copy message`, () => {
                const parts = vm?._messageBody?.parts || []
                const texts = parts.filter(p => p.text || p.url)
                const texts2 = texts.map(t => t.url || t.text || '').join('')
                navigator?.clipboard?.writeText?.(texts2)
            }).setIcon('msg-menu-more-cp-link').setData(`${vm.sender}`));
        }
        if (vm.canRedact) {
            options.push(Menu.option(vm.i18n`Delete message`, () => vm.redact()).setDestructive().setIcon('msg-menu-more-del'));
        }
        this.root().classList.add("menuOpen");
        const onClose = () => this.root().classList.remove("menuOpen");
        const oldMenus = document.querySelectorAll('.popupContainer .msg-vertical')
        if (oldMenus) {
            oldMenus.forEach(menu => {
                menu.parentNode.removeChild(menu)
            })
        }
        this._menuPopup = new Popup(new Menu(options, vm.isOwn ? 'msg-vertical is-own-menu' : 'msg-vertical'), onClose);
        this._menuPopup.trackInTemplateView(this);
        this._menuPopup.showRelativeTo(button, 2);

    }

    createMenuOptions(vm, target) {
        const options = [];
        if (vm.canReact && vm.shape !== "redacted" && !vm.isPending) {
            options.push(Menu.option(vm.i18n``, () => this._toggleEmojiMenu(target, vm)).setIcon('emoji'));
            // options.push(new QuickReactionsMenuOption(vm));
            options.push(Menu.option(vm.i18n``, () => vm.startReply()).setIcon('reply'));
        }
        options.push(Menu.option(vm.i18n``, () => { }).setIcon('thread'));
        options.push(Menu.option(vm.i18n``, () => this._toggleMenuMore(target, vm)).setIcon('more'));
        // if (vm.canAbortSending) {
        //     options.push(Menu.option(vm.i18n`Cancel`, () => vm.abortSending()));
        // } else if (vm.canRedact) {
        //     options.push(Menu.option(vm.i18n`Delete`, () => vm.redact()).setDestructive());
        // }
        return options;
    }

    renderMessageBody() { }
}

class QuickReactionsMenuOption {
    constructor(vm) {
        this._vm = vm;
        this._EmkojiReactionPicker = null
    }
    closeEmoji(event, thePicker) {
        if (thePicker?.style?.display !== 'none') {
            thePicker.style.display = 'none'
            event?.stopPropagation?.()
        }
    }
    fetchSingleEmoji(vm, evt) {
        if (!this._EmkojiReactionPicker) {
            this._EmkojiReactionPicker = new EmojiMart.Picker({
                previewPosition: 'bottom',
                onEmojiSelect: (e) => {
                    vm.react(`${e.native}`)
                    this.closeEmoji(e, this._EmkojiReactionPicker)
                },
                onClickOutside: (e) => this.closeEmoji(e, this._EmkojiReactionPicker)
            })

            document.body.appendChild(this._EmkojiReactionPicker)
            this._EmkojiReactionPicker.className = 'reactions-emoji'
            evt.stopPropagation()
        } else {
            if (this._EmkojiReactionPicker.style.display === 'none') {
                this._EmkojiReactionPicker.style.display = 'flex'
                evt.stopPropagation()
            }
        }
    }
    toDOM(t) {
        const emojiButtons = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"].map(emoji => {
            return t.button({ onClick: () => this._vm.react(emoji) }, emoji);
        });
        const customButton = t.button({
            className: 'emoji-more',
            onClick: (e) => {
                this.fetchSingleEmoji(this._vm, e)
            }
        }, "➕");
        return t.li({ className: "quick-reactions" }, [...emojiButtons, customButton]);
    }
}
