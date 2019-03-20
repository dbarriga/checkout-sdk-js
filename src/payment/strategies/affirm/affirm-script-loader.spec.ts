import { Affirm, AffirmHostWindow } from './affirm';
import AffirmScriptLoader from './affirm-script-loader';
import { getAffirmScriptMock } from './affirm.mock';
import affirmJS from './affirmJs';

jest.mock('./affirmJs');

describe('AffirmScriptLoader', () => {
    let affirmScriptLoader: AffirmScriptLoader;
    let affirmWindow: AffirmHostWindow;

    beforeEach(() => {
        affirmWindow = {} as AffirmHostWindow;
        affirmScriptLoader = new AffirmScriptLoader(affirmWindow);
    });

    describe('#load()', () => {
        let affirmScript: Affirm;

        beforeEach(() => {
            affirmScript = getAffirmScriptMock();
            affirmJS.mockImplementation(() => {
                affirmWindow.affirm = affirmScript;
            });
        });

        it('loads the Script', async () => {
            await affirmScriptLoader.load('apiKeyTest', false);
            expect(affirmJS).toHaveBeenCalledWith('apiKeyTest', '//cdn1.affirm.com/js/v2/affirm.js');
        });

        it('returns the Script from the window', async () => {
            const Affirm = await affirmScriptLoader.load();
            expect(Affirm).toBe(affirmScript);
        });
    });
});
