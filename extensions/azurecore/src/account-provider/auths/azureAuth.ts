/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import * as qs from 'qs';
import * as url from 'url';

import {
	AzureAccountProviderMetadata,
	Tenant,
	AzureAccount,
	Resource,
	AzureAuthType,
	Subscription,
	Deferred
} from '../interfaces';

import { SimpleTokenCache } from '../simpleTokenCache';
import { MemoryDatabase } from '../utils/memoryDatabase';
const localize = nls.loadMessageBundle();

export interface AccountKey {
	/**
	 * Account Key - uniquely identifies an account
	 */
	key: string
}

export interface AccessToken extends AccountKey {
	/**
	 * Access Token
	 */
	token: string;
}

export interface RefreshToken extends AccountKey {
	/**
	 * Refresh Token
	 */
	token: string;

	/**
	 * Account Key
	 */
	key: string
}

export interface TokenResponse {
	[tenantId: string]: Token
}

export interface Token extends AccountKey {
	/**
	 * Access token
	 */
	token: string;

	/**
	 * TokenType
	 */
	tokenType: string;
}

export interface TokenClaims { // https://docs.microsoft.com/en-us/azure/active-directory/develop/id-tokens
	aud: string;
	iss: string;
	iat: number;
	idp: string,
	nbf: number;
	exp: number;
	c_hash: string;
	at_hash: string;
	aio: string;
	preferred_username: string;
	email: string;
	name: string;
	nonce: string;
	oid: string;
	roles: string[];
	rh: string;
	sub: string;
	tid: string;
	unique_name: string;
	uti: string;
	ver: string;
}

export type TokenRefreshResponse = { accessToken: AccessToken, refreshToken: RefreshToken, tokenClaims: TokenClaims, expiresOn: string };

export abstract class AzureAuth implements vscode.Disposable {
	protected readonly memdb = new MemoryDatabase();

	protected readonly WorkSchoolAccountType: string = 'work_school';
	protected readonly MicrosoftAccountType: string = 'microsoft';

	protected readonly loginEndpointUrl: string;
	protected readonly commonTenant: string;
	protected readonly redirectUri: string;
	protected readonly scopes: string[];
	protected readonly scopesString: string;
	protected readonly clientId: string;
	protected readonly resources: Resource[];


	constructor(
		protected readonly metadata: AzureAccountProviderMetadata,
		protected readonly tokenCache: SimpleTokenCache,
		protected readonly context: vscode.ExtensionContext,
		protected readonly uriEventEmitter: vscode.EventEmitter<vscode.Uri>,
		protected readonly authType: AzureAuthType,
		public readonly userFriendlyName: string
	) {
		this.loginEndpointUrl = this.metadata.settings.host;
		this.commonTenant = 'common';
		this.redirectUri = this.metadata.settings.redirectUri;
		this.clientId = this.metadata.settings.clientId;

		this.resources = [
			this.metadata.settings.armResource,
			this.metadata.settings.sqlResource,
			this.metadata.settings.graphResource,
			this.metadata.settings.ossRdbmsResource,
			this.metadata.settings.microsoftResource,
			this.metadata.settings.azureKeyVaultResource
		];

		this.scopes = [...this.metadata.settings.scopes];
		this.scopesString = this.scopes.join(' ');
	}

	public abstract async login(): Promise<AzureAccount | azdata.PromptFailedResult>;

	public abstract async autoOAuthCancelled(): Promise<void>;

	public abstract async promptForConsent(resourceId: string, tenant: string): Promise<{ tokenRefreshResponse: TokenRefreshResponse, authCompleteDeferred: Deferred<void> } | undefined>;

	public dispose() { }

	public async refreshAccess(oldAccount: azdata.Account): Promise<azdata.Account> {
		const response = await this.getCachedToken(oldAccount.key);
		if (!response) {
			oldAccount.isStale = true;
			return oldAccount;
		}

		const refreshToken = response.refreshToken;
		if (!refreshToken || !refreshToken.key) {
			oldAccount.isStale = true;
			return oldAccount;
		}

		try {
			// Refresh the access token
			const tokenResponse = await this.refreshAccessToken(oldAccount.key, refreshToken);
			const tenants = await this.getTenants(tokenResponse.accessToken);

			// Recreate account object
			const newAccount = this.createAccount(tokenResponse.tokenClaims, tokenResponse.accessToken.key, tenants);

			const subscriptions = await this.getSubscriptions(newAccount);
			newAccount.properties.subscriptions = subscriptions;

			return newAccount;
		} catch (ex) {
			oldAccount.isStale = true;
			if (ex.message) {
				await vscode.window.showErrorMessage(ex.message);
			}
			console.log(ex);
		}
		return oldAccount;
	}


	public async getSecurityToken(account: azdata.Account, azureResource: azdata.AzureResource): Promise<TokenResponse | undefined> {
		if (account.isStale === true) {
			console.log('Account was stale, no tokens being fetched');
			return undefined;
		}

		const resource = this.resources.find(s => s.azureResourceId === azureResource);
		if (!resource) {
			return undefined;
		}

		const azureAccount = account as AzureAccount;
		const response: TokenResponse = {};

		for (const tenant of azureAccount.properties.tenants) {
			let cachedTokens = await this.getCachedToken(account.key, resource.id, tenant.id);
			// Check expiration
			if (cachedTokens) {
				const expiresOn = Number(this.memdb.get(this.createMemdbString(account.key.accountId, tenant.id, resource.id)));
				const currentTime = new Date().getTime() / 1000;

				if (!Number.isNaN(expiresOn)) {
					const remainingTime = expiresOn - currentTime;
					const fiveMinutes = 5 * 60;
					// If the remaining time is less than five minutes, assume the token has expired. It's too close to expiration to be meaningful.
					if (remainingTime < fiveMinutes) {
						cachedTokens = undefined;
					}
				} else {
					// No expiration date, assume expired.
					cachedTokens = undefined;
					console.info('Assuming expired token due to no expiration date - this is expected on first launch.');
				}

			}

			// Refresh
			if (!cachedTokens) {

				const baseToken = await this.getCachedToken(account.key);
				if (!baseToken) {
					account.isStale = true;
					console.log('Base token was empty, account is stale.');
					return undefined;
				}

				try {
					await this.refreshAccessToken(account.key, baseToken.refreshToken, tenant, resource);
				} catch (ex) {
					console.log(`Could not refresh access token for ${JSON.stringify(tenant)} - silently removing the tenant from the user's account.`);
					azureAccount.properties.tenants = azureAccount.properties.tenants.filter(t => t.id !== tenant.id);
					continue;
				}

				cachedTokens = await this.getCachedToken(account.key, resource.id, tenant.id);
				if (!cachedTokens) {
					console.log('Refresh access tokens didn not set cache');
					return undefined;
				}
			}
			const { accessToken } = cachedTokens;
			response[tenant.id] = {
				token: accessToken.token,
				key: accessToken.key,
				tokenType: 'Bearer'
			};
		}

		if (azureAccount.properties.subscriptions) {
			azureAccount.properties.subscriptions.forEach(subscription => {
				// Make sure that tenant has information populated.
				if (response[subscription.tenantId]) {
					response[subscription.id] = {
						...response[subscription.tenantId]
					};
				}
			});
		}

		return response;
	}

	public async clearCredentials(account: azdata.AccountKey): Promise<void> {
		try {
			return this.deleteAccountCache(account);
		} catch (ex) {
			const msg = localize('azure.cacheErrrorRemove', "Error when removing your account from the cache.");
			vscode.window.showErrorMessage(msg);
			console.error('Error when removing tokens.', ex);
		}
	}

	protected toBase64UrlEncoding(base64string: string): string {
		return base64string.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); // Need to use base64url encoding
	}

	protected async makePostRequest(uri: string, postData: { [key: string]: string }, validateStatus = false) {
		try {
			const config: AxiosRequestConfig = {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			};

			if (validateStatus) {
				config.validateStatus = () => true;
			}

			return await axios.post(uri, qs.stringify(postData), config);
		} catch (ex) {
			console.log('Unexpected error making Azure auth request', 'azureCore.postRequest', JSON.stringify(ex?.response?.data, undefined, 2));
			throw ex;
		}
	}

	protected async makeGetRequest(token: string, uri: string): Promise<AxiosResponse<any>> {
		try {
			const config = {
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
			};

			return await axios.get(uri, config);
		} catch (ex) {
			// Intercept and print error
			console.log('Unexpected error making Azure auth request', 'azureCore.getRequest', JSON.stringify(ex?.response?.data, undefined, 2));
			// rethrow error
			throw ex;
		}
	}

	protected async getTenants(token: AccessToken): Promise<Tenant[]> {
		interface TenantResponse { // https://docs.microsoft.com/en-us/rest/api/resources/tenants/list
			id: string
			tenantId: string
			displayName?: string
			tenantCategory?: string
		}

		const tenantUri = url.resolve(this.metadata.settings.armResource.endpoint, 'tenants?api-version=2019-11-01');
		try {
			const tenantResponse = await this.makeGetRequest(token.token, tenantUri);
			const tenants: Tenant[] = tenantResponse.data.value.map((tenantInfo: TenantResponse) => {
				return {
					id: tenantInfo.tenantId,
					displayName: tenantInfo.displayName ? tenantInfo.displayName : localize('azureWorkAccountDisplayName', "Work or school account"),
					userId: token.key,
					tenantCategory: tenantInfo.tenantCategory
				} as Tenant;
			});

			const homeTenantIndex = tenants.findIndex(tenant => tenant.tenantCategory === 'Home');
			if (homeTenantIndex >= 0) {
				const homeTenant = tenants.splice(homeTenantIndex, 1);
				tenants.unshift(homeTenant[0]);
			}

			return tenants;
		} catch (ex) {
			console.log(ex);
			throw new Error('Error retrieving tenant information');
		}
	}

	protected async getSubscriptions(account: AzureAccount): Promise<Subscription[]> {
		interface SubscriptionResponse { // https://docs.microsoft.com/en-us/rest/api/resources/subscriptions/list
			subscriptionId: string
			tenantId: string
			displayName: string
		}
		const allSubs: Subscription[] = [];
		const tokens = await this.getSecurityToken(account, azdata.AzureResource.ResourceManagement);
		if (!tokens) {
			console.log('There were no resource management tokens to retrieve subscriptions from. Account is stale.');
			account.isStale = true;
		}

		for (const tenant of account.properties.tenants) {
			const token = tokens[tenant.id];
			const subscriptionUri = url.resolve(this.metadata.settings.armResource.endpoint, 'subscriptions?api-version=2019-11-01');
			try {
				const subscriptionResponse = await this.makeGetRequest(token.token, subscriptionUri);
				const subscriptions: Subscription[] = subscriptionResponse.data.value.map((subscriptionInfo: SubscriptionResponse) => {
					return {
						id: subscriptionInfo.subscriptionId,
						displayName: subscriptionInfo.displayName,
						tenantId: subscriptionInfo.tenantId
					} as Subscription;
				});
				allSubs.push(...subscriptions);
			} catch (ex) {
				console.log(ex);
				throw new Error('Error retrieving subscription information');
			}
		}
		return allSubs;
	}

	protected async getToken(postData: { [key: string]: string }, tenant = this.commonTenant, resourceId: string = '', resourceEndpoint: string = ''): Promise<TokenRefreshResponse | undefined> {
		try {
			let refreshResponse: TokenRefreshResponse;

			try {
				const tokenUrl = `${this.loginEndpointUrl}${tenant}/oauth2/token`;
				const tokenResponse = await this.makePostRequest(tokenUrl, postData);
				const tokenClaims = this.getTokenClaims(tokenResponse.data.access_token);

				const accessToken: AccessToken = {
					token: tokenResponse.data.access_token,
					key: tokenClaims.email || tokenClaims.unique_name || tokenClaims.name,
				};

				const refreshToken: RefreshToken = {
					token: tokenResponse.data.refresh_token,
					key: accessToken.key
				};
				const expiresOn = tokenResponse.data.expires_on;

				refreshResponse = { accessToken, refreshToken, tokenClaims, expiresOn };
			} catch (ex) {
				if (ex?.response?.data?.error === 'interaction_required') {
					const shouldOpenLink = await this.openConsentDialog(tenant, resourceId);
					if (shouldOpenLink === true) {
						const { tokenRefreshResponse, authCompleteDeferred } = await this.promptForConsent(resourceEndpoint, tenant);
						refreshResponse = tokenRefreshResponse;
						authCompleteDeferred.resolve();
					} else {
						vscode.window.showInformationMessage(localize('azure.noConsentToReauth', "The authentication failed since Azure Data Studio was unable to open re-authentication page."));
					}
				} else {
					return undefined;
				}
			}

			this.memdb.set(this.createMemdbString(refreshResponse.accessToken.key, tenant, resourceId), refreshResponse.expiresOn);
			return refreshResponse;
		} catch (err) {
			const msg = localize('azure.noToken', "Retrieving the Azure token failed. Please sign in again.");
			vscode.window.showErrorMessage(msg);
			throw new Error(err);
		}
	}

	private async openConsentDialog(tenantId: string, resourceId: string): Promise<boolean> {
		interface ConsentMessageItem extends vscode.MessageItem {
			booleanResult: boolean;
		}

		const openItem: ConsentMessageItem = {
			title: localize('open', "Open"),
			booleanResult: true
		};

		const closeItem: ConsentMessageItem = {
			title: localize('cancel', "Cancel"),
			isCloseAffordance: true,
			booleanResult: false
		};

		const messageBody = localize('azurecore.consentDialog.body', "Your tenant {0} requires you to re-authenticate again to access {1} resources. Press Open to start the authentication process.", tenantId, resourceId);
		const result = await vscode.window.showInformationMessage(messageBody, { modal: true }, openItem, closeItem);

		return result.booleanResult;
	}

	protected getTokenClaims(accessToken: string): TokenClaims | undefined {
		try {
			const split = accessToken.split('.');
			return JSON.parse(Buffer.from(split[1], 'base64').toString('binary'));
		} catch (ex) {
			throw new Error('Unable to read token claims: ' + JSON.stringify(ex));
		}
	}

	private async refreshAccessToken(account: azdata.AccountKey, rt: RefreshToken, tenant?: Tenant, resource?: Resource): Promise<TokenRefreshResponse> {
		const postData: { [key: string]: string } = {
			grant_type: 'refresh_token',
			refresh_token: rt.token,
			client_id: this.clientId,
			tenant: this.commonTenant,
		};

		if (resource) {
			postData.resource = resource.endpoint;
		}

		const getTokenResponse = await this.getToken(postData, tenant?.id, resource?.id, resource?.endpoint);

		const accessToken = getTokenResponse?.accessToken;
		const refreshToken = getTokenResponse?.refreshToken;

		if (!accessToken || !refreshToken) {
			console.log('Access or refresh token were undefined');
			const msg = localize('azure.refreshTokenError', "Error when refreshing your account.");
			throw new Error(msg);
		}

		await this.setCachedToken(account, accessToken, refreshToken, resource?.id, tenant?.id);

		return getTokenResponse;
	}


	public async setCachedToken(account: azdata.AccountKey, accessToken: AccessToken, refreshToken: RefreshToken, resourceId?: string, tenantId?: string): Promise<void> {
		const msg = localize('azure.cacheErrorAdd', "Error when adding your account to the cache.");
		resourceId = resourceId ?? '';
		tenantId = tenantId ?? '';
		if (!accessToken || !accessToken.token || !refreshToken.token || !accessToken.key) {
			throw new Error(msg);
		}

		try {
			await this.tokenCache.saveCredential(`${account.accountId}_access_${resourceId}_${tenantId}`, JSON.stringify(accessToken));
			await this.tokenCache.saveCredential(`${account.accountId}_refresh_${resourceId}_${tenantId}`, JSON.stringify(refreshToken));
		} catch (ex) {
			console.error('Error when storing tokens.', ex);
			throw new Error(msg);
		}
	}

	public async getCachedToken(account: azdata.AccountKey, resourceId?: string, tenantId?: string): Promise<{ accessToken: AccessToken, refreshToken: RefreshToken } | undefined> {
		resourceId = resourceId ?? '';
		tenantId = tenantId ?? '';

		let accessToken: AccessToken;
		let refreshToken: RefreshToken;
		try {
			accessToken = JSON.parse(await this.tokenCache.getCredential(`${account.accountId}_access_${resourceId}_${tenantId}`));
			refreshToken = JSON.parse(await this.tokenCache.getCredential(`${account.accountId}_refresh_${resourceId}_${tenantId}`));
		} catch (ex) {
			return undefined;
		}

		if (!accessToken || !refreshToken) {
			return undefined;
		}

		if (!refreshToken.token || !refreshToken.key) {
			return undefined;
		}

		if (!accessToken.token || !accessToken.key) {
			return undefined;
		}

		return {
			accessToken,
			refreshToken
		};

	}

	public createMemdbString(accountKey: string, tenantId: string, resourceId: string): string {
		return `${accountKey}_${tenantId}_${resourceId}`;
	}

	public async deleteAccountCache(account: azdata.AccountKey): Promise<void> {
		const results = await this.tokenCache.findCredentials(account.accountId);

		for (let { account } of results) {
			await this.tokenCache.clearCredential(account);
		}
	}

	public async deleteAllCache(): Promise<void> {
		const results = await this.tokenCache.findCredentials('');

		for (let { account } of results) {
			await this.tokenCache.clearCredential(account);
		}
	}

	public createAccount(tokenClaims: TokenClaims, key: string, tenants: Tenant[]): AzureAccount {
		// Determine if this is a microsoft account
		let accountIssuer = 'unknown';

		if (tokenClaims.iss === 'https://sts.windows.net/72f988bf-86f1-41af-91ab-2d7cd011db47/') {
			accountIssuer = 'corp';
		}
		if (tokenClaims?.idp === 'live.com') {
			accountIssuer = 'msft';
		}

		const displayName = tokenClaims.name ?? tokenClaims.email ?? tokenClaims.unique_name;

		let contextualDisplayName: string;
		switch (accountIssuer) {
			case 'corp':
				contextualDisplayName = localize('azure.microsoftCorpAccount', "Microsoft Corp");
				break;
			case 'msft':
				contextualDisplayName = localize('azure.microsoftAccountDisplayName', 'Microsoft Account');
				break;
			default:
				contextualDisplayName = displayName;
		}

		let accountType = accountIssuer === 'msft'
			? this.MicrosoftAccountType
			: this.WorkSchoolAccountType;

		const account = {
			key: {
				providerId: this.metadata.id,
				accountId: key
			},
			name: key,
			displayInfo: {
				accountType: accountType,
				userId: key,
				contextualDisplayName: contextualDisplayName,
				displayName
			},
			properties: {
				providerSettings: this.metadata,
				isMsAccount: accountIssuer === 'msft',
				tenants,
				azureAuthType: this.authType
			},
			isStale: false
		} as AzureAccount;

		return account;
	}
}
