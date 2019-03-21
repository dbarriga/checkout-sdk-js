import { StandardError } from '../../../common/error/errors';

import { Affirm, AffirmHostWindow, SCRIPTS_DEFAULT } from './affirm';
import loadAffirmJS from './affirmJs';

export default class AffirmScriptLoader {
    constructor(
        public _window: AffirmHostWindow = window
    ) { }

    load(apikey?: string, testMode?: boolean): Promise<Affirm> {
        const scriptURI = this._getScriptURI(testMode);

        loadAffirmJS(apikey, scriptURI);
        if (!this._window.affirm) {
            throw new StandardError();
        }

        return Promise.resolve(this._window.affirm);
    }

    private _getScriptURI(testMode: boolean = false): string {
        return testMode ? SCRIPTS_DEFAULT.SANDBOX : SCRIPTS_DEFAULT.PROD;
    }
}
