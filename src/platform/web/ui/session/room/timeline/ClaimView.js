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

import { BaseMessageView } from "./BaseMessageView.js";

export class ClaimView extends BaseMessageView {
    renderMessageBody(t, vm) {
        const children = [];
        const fileCardTxt1 = t.div({ className: 'claim-card-colored' }, vm => vm.value)
        const fileCardTxtMiddle = t.div({ className: 'claim-card-middle' }, [' ','claimed by', ' '])
        const fileCardTxt2 = t.div({ className: 'claim-card-desc' }, [vm.sender])
        const fileCardTxt = t.div({ className: 'claim-card-txt' }, [fileCardTxt1, fileCardTxtMiddle, fileCardTxt2])
        const fileCard = t.div({ className: 'claim-card'})
        fileCard.appendChild(fileCardTxt)
        children.push(
            fileCard,
        );
        return t.p({ className: "Timeline_messageBody tx-message" }, children);
    }
}
