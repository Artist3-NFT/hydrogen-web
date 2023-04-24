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

import {BaseMessageTile} from "./BaseMessageTile.js";

export class TxTile extends BaseMessageTile {
    constructor(entry, options) {
        super(entry, options);
    }

    get content() {
        const content = this._getContent();
        return content;
    }
    get tokenLogo() {
        const content = this._getContent();
        return content?.tokenData?.logo || "https://storage.googleapis.com/gamic-prod/token/logo/8.png";
    }
    get tokenname() {
        const content = this._getContent();
        return content?.tokenData?.name || 'token name';
    }
    get message() {
        const content = this._getContent();
        return content?.message || `🎁 Mystery Box 🎁`;
    }

    get shape() {
        return "tx";
    }
}
