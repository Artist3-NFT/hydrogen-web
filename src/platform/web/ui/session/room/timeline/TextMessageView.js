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

import { tag, text } from "../../../general/html";
import { BaseMessageView } from "./BaseMessageView.js";
import { ReplyPreviewError, ReplyPreviewView } from "./ReplyPreviewView.js";

export class TextMessageView extends BaseMessageView {
    renderMessageBody(t, vm) {
        const time = t.time({ className: { hidden: !vm.time } }, vm.time);
        const container = t.div({
            className: {
                "Timeline_messageBody": true,
                statusMessage: vm => vm.shape === "message-status",
            }
        }, t.mapView(vm => vm.replyTile, replyTile => {
            if (this._isReplyPreview) {
                // if this._isReplyPreview = true, this is already a reply preview, don't nest replies for now.
                return null;
            }
            else if (vm.isReply && !replyTile) {
                return new ReplyPreviewError();
            }
            else if (replyTile) {
                return new ReplyPreviewView(replyTile, this._viewClassForTile);
            }
            else {
                return null;
            }
        }));



        // exclude comment nodes as they are used by t.map and friends for placeholders
        const shouldRemove = (element) => element?.nodeType !== Node.COMMENT_NODE && element.className !== "ReplyPreviewView";

        t.mapSideEffect(vm => vm.body, body => {
            while (shouldRemove(container.lastChild)) {
                container.removeChild(container.lastChild);
            }
            for (const part of body.parts) {
                container.appendChild(renderPart(part));
            }
        });
        if (container.innerHTML.includes('@here')) {
            container.innerHTML = container.innerHTML.replace('@here', `<span class="msg-mention-hightlight">@here</span>`)
        }
        // container.appendChild(timeContainer);
        if (window.currentRoomMembers) {
            const memberUserNames = window.currentRoomMembers.filter(r => container.innerHTML.includes(`@${r.username}`)).map(u => u.username)
            memberUserNames.forEach(name => {
                container.innerHTML = container.innerHTML.replace(`@${name}`, `<span class="msg-mention-hightlight">@${name}</span>`)
            })
        } else {
            if (container.innerHTML.includes('@')) {
                if (!window.currentRoomMentions) {
                    window.currentRoomMentions = []
                }
                window.currentRoomMentions.push(container)
            }
        }
        const singleEmojiRegex = /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])$/
        const isSingleEmoji = singleEmojiRegex.test(container.innerText)
        if (vm._format === 'Plain' && isSingleEmoji) {
            const hex = container.innerText.codePointAt(0).toString(16)
            container.innerHTML = `
                <picture class="dynamic-emoji-imger-container">
                    <source srcset="https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.webp" type="image/webp">
                    <img class="dynamic-emoji-imger" src="https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif" 
                    onerror="this.classList.add('dynamic-emoji-imger-broken')"
                    alt="${container.innerText}" width="84" height="84">
                </picture>
            `
        } else if (window.emojione && window.emojione?.toImage && vm._format === 'Plain') {
            container.innerHTML = window.emojione?.toImage?.(container.innerHTML)
        }
        return container;
    }
}

function renderList(listBlock) {
    const items = listBlock.items.map(item => tag.li(renderParts(item)));
    const start = listBlock.startOffset;
    if (start) {
        return tag.ol({ start }, items);
    } else {
        return tag.ul(items);
    }
}

function renderImage(imagePart) {
    const attributes = { src: imagePart.src };
    if (imagePart.width) { attributes.width = imagePart.width }
    if (imagePart.height) { attributes.height = imagePart.height }
    if (imagePart.alt) { attributes.alt = imagePart.alt }
    if (imagePart.title) { attributes.title = imagePart.title }
    return tag.img(attributes);
}

function renderPill(pillPart) {
    // The classes and structure are borrowed from avatar.js;
    // We don't call renderStaticAvatar because that would require
    // an intermediate object that has getAvatarUrl etc.
    const classes = `avatar size-12 usercolor${pillPart.avatarColorNumber}`;
    const avatar = tag.div({ class: classes }, text(pillPart.avatarInitials));
    const children = renderParts(pillPart.children);
    children.unshift(avatar);
    return tag.a({ class: "pill", href: pillPart.href, rel: "noopener", target: "_blank" }, children);
}

function renderTable(tablePart) {
    const children = [];
    if (tablePart.head) {
        const headers = tablePart.head
            .map(cell => tag.th(renderParts(cell)));
        children.push(tag.thead(tag.tr(headers)))
    }
    const rows = [];
    for (const row of tablePart.body) {
        const data = row.map(cell => tag.td(renderParts(cell)));
        rows.push(tag.tr(data));
    }
    children.push(tag.tbody(rows));
    return tag.table(children);
}

/**
 * Map from part to function that outputs DOM for the part
 */
const formatFunction = {
    header: headerBlock => tag["h" + Math.min(6, headerBlock.level)](renderParts(headerBlock.inlines)),
    codeblock: codeBlock => tag.pre(tag.code(text(codeBlock.text))),
    table: tableBlock => renderTable(tableBlock),
    code: codePart => tag.code(text(codePart.text)),
    text: textPart => text(textPart.text),
    link: linkPart => tag.a({ href: linkPart.url, className: "link", target: "_blank", rel: "noopener" }, renderParts(linkPart.inlines)),
    pill: renderPill,
    format: formatPart => tag[formatPart.format](renderParts(formatPart.children)),
    rule: () => tag.hr(),
    list: renderList,
    image: renderImage,
    newline: () => tag.br()
};

function renderPart(part) {
    const f = formatFunction[part.type];
    if (!f) {
        return text(`[unknown part type ${part.type}]`);
    }
    return f(part);
}

function renderParts(parts) {
    return Array.from(parts, renderPart);
}
