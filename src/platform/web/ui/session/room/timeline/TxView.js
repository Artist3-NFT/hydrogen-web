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

export class TxView extends BaseMessageView {
    renderMessageBody(t, vm) {
        const children = [];
        const fileCardImg = t.div({ className: 'tx-card-image', style: `background-image: url(${vm.tokenLogo})`})
        const fileCardTxt1 = t.div({ className: 'tx-card-content' }, vm => vm.tokenname)
        const fileCardTxt2 = t.div({ className: 'tx-card-content tx-card-desc' }, [vm.message])
        const fileCardTxt = t.div({ className: 'tx-card-txt' }, [fileCardTxt1, fileCardTxt2])
        const fileCard = t.div({ className: 'tx-card', onClick: (e) => {
            e.txContent = vm.content;
        } })
        fileCard.appendChild(fileCardImg)
        fileCard.appendChild(fileCardTxt)
        children.push(
            fileCard,
        );
        return t.p({ className: "Timeline_messageBody tx-message" }, children);
    }
}
