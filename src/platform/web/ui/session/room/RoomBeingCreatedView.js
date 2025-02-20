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

import {TemplateView} from "../../general/TemplateView";
import {LoadingView} from "../../general/LoadingView";
import {AvatarView} from "../../AvatarView";
import {splitNamePrefix} from "../../../utils/someUtils";
export class RoomBeingCreatedView extends TemplateView {
    render(t, vm) {
        return t.main({className: "RoomView middle"}, [
            t.div({className: "RoomHeader middle-header"}, [
                t.a({className: "button-utility close-middle", href: vm.closeUrl, title: vm.i18n`Close room`}),
                t.view(new AvatarView(vm, 32)),
                t.div({className: "room-description"}, [
                    t.h2(vm => splitNamePrefix(vm.name)),
                ])
            ]),
            t.div({className: "RoomView_body"}, [
                t.mapView(vm => vm.error, error => {
                    if (error) {
                        return new ErrorView(vm);
                    } else {
                        return new LoadingView(vm.i18n`Setting up the room…`);
                    }
                })
            ])
        ]);
    }
}

class ErrorView extends TemplateView {
    render(t,vm) {
        return t.div({className: "RoomBeingCreated_error centered-column"}, [
            t.h3(vm.i18n`Could not create the room, something went wrong:`),
            t.div({className: "RoomView_error form-group"}, vm.error),
            t.div({className: "button-row"},
                t.button({
                    className: "button-action primary destructive",
                    onClick: () => vm.cancel()
                }, vm.i18n`Cancel`))
        ]);
    }
}
