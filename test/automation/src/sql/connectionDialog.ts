/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from '../code';
import { waitForNewDialog } from './sqlutils';

const CONNECTION_DIALOG_TITLE = 'Connection';

export class ConnectionDialog {

	constructor(private code: Code) { }

	async waitForConnectionDialog(): Promise<void> {
		await waitForNewDialog(this.code, CONNECTION_DIALOG_TITLE);
	}

	private static readonly PROVIDER_SELECTOR = '.modal .modal-body select[aria-label="Connection type"]';
	async setProvider(provider: string): Promise<void> {
		await this.code.waitForSetValue(ConnectionDialog.PROVIDER_SELECTOR, provider);
	}

	private static readonly TARGET_SELECTOR = '.modal .modal-body input[aria-label="${TARGET}"]';
	async setTarget(target: string, value: string): Promise<void> {
		await this.code.waitForSetValue(ConnectionDialog.TARGET_SELECTOR.replace('${TARGET}', '' + target), value);
	}

	private static readonly CONNECT_BUTTON_SELECTOR = '.modal .modal-footer a[aria-label="Connect"]';
	async connect(): Promise<void> {
		await this.code.waitAndClick(ConnectionDialog.CONNECT_BUTTON_SELECTOR);

		const selector = `.editor-instance .monaco-editor textarea`;
		return this.code.waitForActiveElement(selector);
	}
}
