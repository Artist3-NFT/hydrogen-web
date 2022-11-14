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

import { BaseMediaView } from "./BaseMediaView.js";
import { LightboxViewModel } from "../../../../../../domain/session/room/LightboxViewModel.js";
import { LightboxView } from "../../room/LightboxView.js";

export class ImageView extends BaseMediaView {
    renderMedia(t, vm) {
        const img = t.img({
            src: vm => vm.thumbnailUrl,
            alt: vm => vm.label,
            title: vm => vm.label,
            style: `max-width: ${vm.width}px; max-height: ${vm.height}px;`,
            onClick: () => {
                if (window.lightBoxVM) {
                    window.lightBoxVM = null
                }
                if (window.lightBoxView) {
                    window.lightBoxView = null
                }
                window.lightBoxVM = new LightboxViewModel(Object.assign({}, vm._options, { eventId: vm._entry.id, room: vm._options.room }))
                window.lightBoxView = new LightboxView(window.lightBoxVM)
                const med = window.lightBoxView.mount()
                med.setAttribute('id', 'lightbox-main')
                document.body.appendChild(med)
            }
        });
        return img;
        // return vm.isPending || !vm.lightboxUrl ? img : t.a({ href: vm.lightboxUrl }, img);
    }
}
