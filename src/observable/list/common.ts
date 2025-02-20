/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>
Copyright 2021 The Matrix.org Foundation C.I.C.

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
import {BaseObservableList} from "./BaseObservableList";

/* inline update of item in collection backed by array, without replacing the preexising item */
export function findAndUpdateInArray<T>(predicate: (value: T) => boolean, array: T[], observable: BaseObservableList<T>, updater: (value: T) => any | false) {
    const index = array.findIndex(predicate);
    if (index !== -1) {
        const value = array[index];
        // allow bailing out of sending an emit if updater determined its not needed
        const params = updater(value);
        if (params !== false) {
            console.log('ZZQ do emit !!!', index, value, params)
            observable.emitUpdate(index, value, params);
        }
        // found
        return true;
    }
    return false;
}
