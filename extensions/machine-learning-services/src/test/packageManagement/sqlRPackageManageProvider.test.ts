/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import * as should from 'should';
import 'mocha';
import * as TypeMoq from 'typemoq';
import * as constants from '../../common/constants';
import { SqlRPackageManageProvider } from '../../packageManagement/sqlRPackageManageProvider';
import { createContext, TestContext } from './utils';
import * as nbExtensionApis from '../../typings/notebookServices';

describe('SQL R Package Manager', () => {
	it('Should create SQL package manager successfully', async function (): Promise<void> {
		let testContext = createContext();
		should.doesNotThrow(() => createProvider(testContext));
	});

	it('Should return provider Id and target correctly', async function (): Promise<void> {
		let testContext = createContext();
		let provider = createProvider(testContext);
		should.deepEqual(SqlRPackageManageProvider.ProviderId, provider.providerId);
		should.deepEqual({ location: 'SQL', packageType: 'R' }, provider.packageTarget);
	});

	it('listPackages Should return packages sorted by name', async function (): Promise<void> {
		let testContext = createContext();
		let packages: nbExtensionApis.IPackageDetails[] = [
			{
				'name': 'b-name',
				'version': '1.1.1'
			},
			{
				'name': 'a-name',
				'version': '1.1.2'
			}
		];

		let connection = new azdata.connection.ConnectionProfile();
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.queryRunner.setup(x => x.getRPackages(TypeMoq.It.isAny())).returns(() => Promise.resolve(packages));

		let provider = createProvider(testContext);
		let actual = await provider.listPackages();
		let expected = [
			{
				'name': 'a-name',
				'version': '1.1.2'
			},
			{
				'name': 'b-name',
				'version': '1.1.1'
			}
		];
		should.deepEqual(actual, expected);
	});

	it('listPackages Should return empty packages if undefined packages returned', async function (): Promise<void> {
		let testContext = createContext();

		let connection = new azdata.connection.ConnectionProfile();
		let packages: nbExtensionApis.IPackageDetails[];
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.queryRunner.setup(x => x.getRPackages(TypeMoq.It.isAny())).returns(() => Promise.resolve(packages));

		let provider = createProvider(testContext);
		let actual = await provider.listPackages();
		let expected: nbExtensionApis.IPackageDetails[] = [];
		should.deepEqual(actual, expected);
	});

	it('listPackages Should return empty packages if empty packages returned', async function (): Promise<void> {
		let testContext = createContext();

		let connection = new azdata.connection.ConnectionProfile();
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.queryRunner.setup(x => x.getRPackages(TypeMoq.It.isAny())).returns(() => Promise.resolve([]));

		let provider = createProvider(testContext);
		let actual = await provider.listPackages();
		let expected: nbExtensionApis.IPackageDetails[] = [];
		should.deepEqual(actual, expected);
	});

	it('installPackages Should install given packages successfully', async function (): Promise<void> {
		let testContext = createContext();
		let packagesUpdated = false;
		let packages: nbExtensionApis.IPackageDetails[] = [
			{
				'name': 'a-name',
				'version': '1.1.2'
			},
			{
				'name': 'b-name',
				'version': '1.1.1'
			}
		];

		let connection = new azdata.connection.ConnectionProfile();
		connection.serverName = 'serverName';
		connection.databaseName = 'databaseName';
		let credentials = { [azdata.ConnectionOptionSpecialType.password]: 'password' };
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.apiWrapper.setup(x => x.getCredentials(TypeMoq.It.isAny())).returns(() => { return Promise.resolve(credentials); });
		testContext.processService.setup(x => x.execScripts(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns((path, scripts: string[]) => {

			if (path && scripts.find(x => x.indexOf('install') > 0) &&
				scripts.find(x => x.indexOf('server="serverName"') > 0) &&
				scripts.find(x => x.indexOf('database="databaseName"') > 0) &&
				scripts.find(x => x.indexOf('"a-name"') > 0) &&
				scripts.find(x => x.indexOf('pwd="password"') > 0)) {
				packagesUpdated = true;
			}

			return Promise.resolve('');
		});

		let provider = createProvider(testContext);
		await provider.installPackages(packages, false);

		should.deepEqual(packagesUpdated, true);
	});

	it('uninstallPackages Should uninstall given packages successfully', async function (): Promise<void> {
		let testContext = createContext();
		let packagesUpdated = false;
		let packages: nbExtensionApis.IPackageDetails[] = [
			{
				'name': 'a-name',
				'version': '1.1.2'
			},
			{
				'name': 'b-name',
				'version': '1.1.1'
			}
		];

		let connection = new azdata.connection.ConnectionProfile();
		connection.serverName = 'serverName';
		connection.databaseName = 'databaseName';
		let credentials = { [azdata.ConnectionOptionSpecialType.password]: 'password' };
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.apiWrapper.setup(x => x.getCredentials(TypeMoq.It.isAny())).returns(() => { return Promise.resolve(credentials); });
		testContext.processService.setup(x => x.execScripts(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns((path, scripts: string[]) => {

			if (path && scripts.find(x => x.indexOf('remove') > 0) &&
				scripts.find(x => x.indexOf('server="serverName"') > 0) &&
				scripts.find(x => x.indexOf('database="databaseName"') > 0) &&
				scripts.find(x => x.indexOf('"a-name"') > 0) &&
				scripts.find(x => x.indexOf('pwd="password"') > 0)) {
				packagesUpdated = true;
			}

			return Promise.resolve('');
		});

		let provider = createProvider(testContext);
		await provider.uninstallPackages(packages);

		should.deepEqual(packagesUpdated, true);
	});

	it('installPackages Should not install any packages give empty list', async function (): Promise<void> {
		let testContext = createContext();
		let packagesUpdated = false;
		let packages: nbExtensionApis.IPackageDetails[] = [
		];

		let connection = new azdata.connection.ConnectionProfile();
		let credentials = { ['azdata.ConnectionOptionSpecialType.password']: 'password' };
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.apiWrapper.setup(x => x.getCredentials(TypeMoq.It.isAny())).returns(() => { return Promise.resolve(credentials); });
		testContext.processService.setup(x => x.execScripts(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => {
			packagesUpdated = true;
			return Promise.resolve('');
		});


		let provider = createProvider(testContext);
		await provider.installPackages(packages, false);

		should.deepEqual(packagesUpdated, false);
	});

	it('uninstallPackages Should not uninstall any packages give empty list', async function (): Promise<void> {
		let testContext = createContext();
		let packagesUpdated = false;
		let packages: nbExtensionApis.IPackageDetails[] = [
		];

		let connection = new azdata.connection.ConnectionProfile();
		let credentials = { ['azdata.ConnectionOptionSpecialType.password']: 'password' };
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.apiWrapper.setup(x => x.getCredentials(TypeMoq.It.isAny())).returns(() => { return Promise.resolve(credentials); });
		testContext.processService.setup(x => x.execScripts(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => {
			packagesUpdated = true;
			return Promise.resolve('');
		});


		let provider = createProvider(testContext);
		await provider.uninstallPackages(packages);

		should.deepEqual(packagesUpdated, false);
	});

	it('canUseProvider Should return false for no connection', async function (): Promise<void> {
		let testContext = createContext();
		let connection: azdata.connection.ConnectionProfile;
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });

		let provider = createProvider(testContext);
		let actual = await provider.canUseProvider();

		should.deepEqual(actual, false);
	});

	it('canUseProvider Should return false if connection does not have r installed', async function (): Promise<void> {
		let testContext = createContext();

		let connection = new azdata.connection.ConnectionProfile();
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.queryRunner.setup(x => x.isRInstalled(TypeMoq.It.isAny())).returns(() => Promise.resolve(false));

		let provider = createProvider(testContext);
		let actual = await provider.canUseProvider();

		should.deepEqual(actual, false);
	});

	it('canUseProvider Should return true if connection has r installed', async function (): Promise<void> {
		let testContext = createContext();

		let connection = new azdata.connection.ConnectionProfile();
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });
		testContext.queryRunner.setup(x => x.isRInstalled(TypeMoq.It.isAny())).returns(() => Promise.resolve(true));

		let provider = createProvider(testContext);
		let actual = await provider.canUseProvider();

		should.deepEqual(actual, true);
	});

	it('getPackageOverview Should return package info successfully', async function (): Promise<void> {
		let testContext = createContext();
		let packagePreview = {
			'name': 'a-name',
			'versions': ['Latest'],
			'summary': ''
		};

		testContext.httpClient.setup(x => x.fetch(TypeMoq.It.isAny())).returns(() => {
			return Promise.resolve(``);
		});

		let provider = createProvider(testContext);
		let actual = await provider.getPackageOverview('a-name');

		should.deepEqual(actual, packagePreview);
	});

	it('getLocationTitle Should default string for no connection', async function (): Promise<void> {
		let testContext = createContext();
		let connection: azdata.connection.ConnectionProfile;
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });

		let provider = createProvider(testContext);
		let actual = await provider.getLocationTitle();

		should.deepEqual(actual, constants.packageManagerNoConnection);
	});

	it('getLocationTitle Should return connection title string for valid connection', async function (): Promise<void> {
		let testContext = createContext();

		let connection = new azdata.connection.ConnectionProfile();
		connection.serverName = 'serverName';
		connection.databaseName = 'databaseName';
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });

		let provider = createProvider(testContext);
		let actual = await provider.getLocationTitle();

		should.deepEqual(actual, `${connection.serverName} ${connection.databaseName}`);
	});

	it('getLocationTitle Should return server name as connection title if there is not database name', async function (): Promise<void> {
		let testContext = createContext();

		let connection = new azdata.connection.ConnectionProfile();
		connection.serverName = 'serverName';
		testContext.apiWrapper.setup(x => x.getCurrentConnection()).returns(() => { return Promise.resolve(connection); });

		let provider = createProvider(testContext);
		let actual = await provider.getLocationTitle();

		should.deepEqual(actual, `${connection.serverName} `);
	});

	function createProvider(testContext: TestContext): SqlRPackageManageProvider {
		testContext.config.setup(x => x.rExecutable).returns(() => 'r');
		testContext.config.setup(x => x.rPackagesRepository).returns(() => 'http://cran.r-project.org');
		return new SqlRPackageManageProvider(
			testContext.outputChannel,
			testContext.apiWrapper.object,
			testContext.queryRunner.object,
			testContext.processService.object,
			testContext.config.object,
			testContext.httpClient.object);
	}
});
