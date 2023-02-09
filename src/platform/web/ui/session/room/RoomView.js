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

import { TemplateView } from "../../general/TemplateView";
import { Popup } from "../../general/Popup.js";
import { Menu } from "../../general/Menu.js";
import { splitNamePrefix } from "../../../utils/someUtils";
import { TimelineView } from "./TimelineView";
import { TimelineLoadingView } from "./TimelineLoadingView.js";
import { MessageComposer } from "./MessageComposer.js";
import { DisabledComposerView } from "./DisabledComposerView.js";
import { AvatarView } from "../../AvatarView.js";

export class RoomView extends TemplateView {
    constructor(vm, viewClassForTile) {
        super(vm);
        this._viewClassForTile = viewClassForTile;
        this._optionsPopup = null;
    }

    render(t, vm) {
        let dragEnterCount = 0
        const main = t.main({
            className: "RoomView middle",
            ondragenter: (e) => {
                dragEnterCount ++;
                if (!main.classList.contains('draging')) {
                    main.classList.add('draging')
                }
            },
            ondragleave: (e) => {
                dragEnterCount --;
                if (main.classList.contains('draging') && dragEnterCount <= 0) {
                    main.classList.remove('draging')
                    dragEnterCount = 0;
                }
            },
            ondrop: (e) => {
                if (main.classList.contains('draging')) {
                    main.classList.remove('draging')
                }
                if (e.dataTransfer.items.length > 0) {
                    const clipedFilesArr = []
                    for (let index = 0; index < e.dataTransfer.items.length; index++) {
                        const item = e.dataTransfer.items[index];
                        const gotFile = item.getAsFile()
                        if (item.kind === 'file' && gotFile) {
                            clipedFilesArr.push(gotFile)
                        }
                    }
                    if (clipedFilesArr.length > 0) {
                        e.sendFunc2 = (caption) => vm._composerVM.sendMultiPictureOrFileByPaste(clipedFilesArr, caption)
                        e.sendData = clipedFilesArr
                    }
                }
                e.preventDefault()
            },
            ondragover: (e) => {
                e.preventDefault()
            },
        }, [
            t.div({ className: "RoomHeader middle-header" }, [
                t.a({ className: "button-utility close-middle", href: vm.closeUrl, title: vm.i18n`Close room` }),
                t.view(new AvatarView(vm, 32)),
                t.div({ className: "room-description" }, [
                    t.h2(vm => splitNamePrefix(vm.name)),
                ]),
                t.button({
                    className: "button-utility room-options",
                    "aria-label": vm.i18n`Room options`,
                    onClick: evt => this._toggleOptionsMenu(evt)
                })
            ]),
            t.div({ className: "RoomView_body" }, [
                t.div({ className: "RoomView_error" }, [
                    t.if(vm => vm.error, t => t.div(
                        [
                            t.p({}, vm => vm.error),
                            t.button({ className: "RoomView_error_closerButton", onClick: evt => vm.dismissError(evt) })
                        ])
                    )]),
                t.mapView(vm => vm.timelineViewModel, timelineViewModel => {
                    return timelineViewModel ?
                        new TimelineView(timelineViewModel, this._viewClassForTile) :
                        new TimelineLoadingView(vm);    // vm is just needed for i18n
                }),
                t.div({ className: 'draging-area' }, [
                    t.div({ className: 'draging-area-inner' }, [
                        t.div({ className: 'draging-area-inner2' }, [
                            t.div({ className: 'draging-area-logo' }),
                            t.div({ className: 'draging-area-title' }, 'Drop files here to send them'),
                            t.div({ className: 'draging-area-title2' }, 'with compression')
                        ])
                    ])
                ]),
                t.mapView(vm => vm.composerViewModel,
                    composerViewModel => {
                        switch (composerViewModel?.kind) {
                            case "composer":
                                return new MessageComposer(vm.composerViewModel, this._viewClassForTile);
                            case "disabled":
                                return new DisabledComposerView(vm.composerViewModel);
                        }
                    }),
            ])
        ]);
        return main;
    }

    _toggleOptionsMenu(evt) {
        if (this._optionsPopup && this._optionsPopup.isOpen) {
            this._optionsPopup.close();
        } else {
            const vm = this.value;
            const options = [];
            options.push(Menu.option(vm.i18n`Room details`, () => vm.openDetailsPanel()))
            if (vm.canLeave) {
                options.push(Menu.option(vm.i18n`Leave room`, () => this._confirmToLeaveRoom()).setDestructive());
            }
            if (vm.canForget) {
                options.push(Menu.option(vm.i18n`Forget room`, () => vm.forgetRoom()).setDestructive());
            }
            if (vm.canRejoin) {
                options.push(Menu.option(vm.i18n`Rejoin room`, () => vm.rejoinRoom()));
            }
            if (!options.length) {
                return;
            }
            this._optionsPopup = new Popup(new Menu(options, 'rv-menu'));
            this._optionsPopup.trackInTemplateView(this);
            this._optionsPopup.showRelativeTo(evt.target, 10);
        }
    }

    _confirmToLeaveRoom() {
        if (confirm(this.value.i18n`Are you sure you want to leave "${this.value.name}"?`)) {
            this.value.leaveRoom();
        }
    }
}
