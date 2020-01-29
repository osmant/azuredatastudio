/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import * as nls from 'vscode-nls';
import { DacFxDataModel } from './models';

const localize = nls.loadMessageBundle();

export abstract class BasePage {

	protected readonly wizardPage: azdata.window.WizardPage;
	protected readonly model: DacFxDataModel;
	protected readonly view: azdata.ModelView;
	protected databaseValues: string[];

	/**
	 * This method constructs all the elements of the page.
	 */
	public async abstract start(): Promise<boolean>;

	/**
	 * This method is called when the user is entering the page.
	 */
	public async abstract onPageEnter(): Promise<boolean>;

	/**
	 * This method is called when the user is leaving the page.
	 */
	async onPageLeave(): Promise<boolean> {
		return true;
	}

	/**
	 * Override this method to cleanup what you don't need cached in the page.
	 */
	public async cleanup(): Promise<boolean> {
		return true;
	}

	/**
	 * Sets up a navigation validator.
	 * This will be called right before onPageEnter().
	 */
	public abstract setupNavigationValidator(): void;

	protected async getServerValues(): Promise<{ connection: azdata.connection.ConnectionProfile, displayName: string, name: string }[]> {
		let cons = await azdata.connection.getConnections(/* activeConnectionsOnly */ true);
		// This user has no active connections ABORT MISSION
		if (!cons || cons.length === 0) {
			return undefined;
		}

		// reverse list so that most recent connections are first
		cons.reverse();

		let count = -1;
		let idx = -1;


		let values = cons.map(c => {
			// Handle the code to remember what the user's choice was from before
			count++;
			if (idx === -1) {
				if (this.model.server && c.connectionId === this.model.server.connectionId) {
					idx = count;
				} else if (this.model.serverId && c.connectionId === this.model.serverId) {
					idx = count;
				}
			}

			let usr = c.options.user;
			let srv = c.options.server;

			if (!usr) {
				usr = localize('basePage.defaultUser', "default");
			}

			let finalName = `${srv} (${usr})`;
			return {
				connection: c,
				displayName: finalName,
				name: c.connectionId
			};
		});

		if (idx >= 0) {
			let tmp = values[0];
			values[0] = values[idx];
			values[idx] = tmp;
		} else {
			this.deleteServerValues();
		}

		// only leave unique server connections
		values = values.reduce((uniqueValues, conn) => {
			let exists = uniqueValues.find(x => x.displayName === conn.displayName);
			if (!exists) {
				uniqueValues.push(conn);
			}
			return uniqueValues;
		}, []);

		return values;
	}

	protected async getDatabaseValues(): Promise<string[]> {
		let idx = -1;
		let count = -1;
		this.databaseValues = (await azdata.connection.listDatabases(this.model.server.connectionId)).map(db => {
			count++;
			if (this.model.database && db === this.model.database) {
				idx = count;
			}

			return db;
		});

		if (idx >= 0) {
			let tmp = this.databaseValues[0];
			this.databaseValues[0] = this.databaseValues[idx];
			this.databaseValues[idx] = tmp;
		} else {
			this.deleteDatabaseValues();
		}

		return this.databaseValues;
	}

	protected deleteServerValues() {
		delete this.model.server;
		delete this.model.serverId;
		delete this.model.database;
	}

	protected deleteDatabaseValues() {
		return;
	}
}
