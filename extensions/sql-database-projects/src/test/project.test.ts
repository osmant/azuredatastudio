/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as should from 'should';
import * as path from 'path';
import * as os from 'os';
import * as baselines from './baselines/baselines';
import * as testUtils from './testUtils';
import * as constants from '../common/constants';

import { promises as fs } from 'fs';
import { Project, EntryType, TargetPlatform, SystemDatabase, DatabaseReferenceLocation } from '../models/project';
import { exists } from '../common/utils';
import { Uri } from 'vscode';

let projFilePath: string;
const isWindows = os.platform() === 'win32';

describe('Project: sqlproj content operations', function (): void {
	before(async function (): Promise<void> {
		await baselines.loadBaselines();
	});

	beforeEach(async () => {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.openProjectFileBaseline);
	});

	it('Should read Project from sqlproj', async function (): Promise<void> {
		const project: Project = new Project(projFilePath);
		await project.readProjFile();

		// Files and folders
		should(project.files.filter(f => f.type === EntryType.File).length).equal(4);
		should(project.files.filter(f => f.type === EntryType.Folder).length).equal(5);

		should(project.files.find(f => f.type === EntryType.Folder && f.relativePath === 'Views\\User')).not.equal(undefined); // mixed ItemGroup folder
		should(project.files.find(f => f.type === EntryType.File && f.relativePath === 'Views\\User\\Profile.sql')).not.equal(undefined); // mixed ItemGroup file

		// SqlCmdVariables
		should(Object.keys(project.sqlCmdVariables).length).equal(2);
		should(project.sqlCmdVariables['ProdDatabaseName']).equal('MyProdDatabase');
		should(project.sqlCmdVariables['BackupDatabaseName']).equal('MyBackupDatabase');

		// Database references
		should(project.databaseReferences.length).equal(1);
		should(project.databaseReferences[0]).containEql(constants.master);
	});

	it('Should add Folder and Build entries to sqlproj', async function (): Promise<void> {
		const project: Project = new Project(projFilePath);
		await project.readProjFile();

		const folderPath = 'Stored Procedures';
		const filePath = path.join(folderPath, 'Fake Stored Proc.sql');
		const fileContents = 'SELECT \'This is not actually a stored procedure.\'';

		await project.addFolderItem(folderPath);
		await project.addScriptItem(filePath, fileContents);

		const newProject = new Project(projFilePath);
		await newProject.readProjFile();

		should(newProject.files.find(f => f.type === EntryType.Folder && f.relativePath === folderPath)).not.equal(undefined);
		should(newProject.files.find(f => f.type === EntryType.File && f.relativePath === filePath)).not.equal(undefined);

		const newFileContents = (await fs.readFile(path.join(newProject.projectFolderPath, filePath))).toString();

		should(newFileContents).equal(fileContents);
	});

	it('Should add Folder and Build entries to sqlproj with pre-existing scripts on disk', async function (): Promise<void> {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.newProjectFileBaseline);
		const project: Project = new Project(projFilePath);
		await project.readProjFile();

		let list: string[] = await testUtils.createListOfFiles(path.dirname(projFilePath));

		await project.addToProject(list);

		should(project.files.filter(f => f.type === EntryType.File).length).equal(11);	// txt file shouldn't be added to the project
		should(project.files.filter(f => f.type === EntryType.Folder).length).equal(3);	// 2folders + default Properties folder
	});

	it('Should throw error while adding Folder and Build entries to sqlproj when a file/folder does not exist on disk', async function (): Promise<void> {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.newProjectFileBaseline);
		const project = new Project(projFilePath);
		await project.readProjFile();

		let list: string[] = [];
		let testFolderPath: string = await testUtils.createDummyFileStructure(true, list, path.dirname(projFilePath));

		const nonexistentFile = path.join(testFolderPath, 'nonexistentFile.sql');
		list.push(nonexistentFile);

		await testUtils.shouldThrowSpecificError(async () => await project.addToProject(list), `ENOENT: no such file or directory, stat \'${nonexistentFile}\'`);
	});

	it('Should choose correct master dacpac', async function (): Promise<void> {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.newProjectFileBaseline);
		const project = new Project(projFilePath);
		await project.readProjFile();

		let uri = project.getSystemDacpacUri(constants.masterDacpac);
		should.equal(uri.fsPath, Uri.parse(path.join('$(NETCoreTargetsPath)', 'SystemDacpacs', '130', constants.masterDacpac)).fsPath);

		project.changeDSP(TargetPlatform.Sql150.toString());
		uri = project.getSystemDacpacUri(constants.masterDacpac);
		should.equal(uri.fsPath, Uri.parse(path.join('$(NETCoreTargetsPath)', 'SystemDacpacs', '150', constants.masterDacpac)).fsPath);

		project.changeDSP(TargetPlatform.SqlAzureV12.toString());
		uri = project.getSystemDacpacUri(constants.masterDacpac);
		should.equal(uri.fsPath, Uri.parse(path.join('$(NETCoreTargetsPath)', 'SystemDacpacs', 'AzureV12', constants.masterDacpac)).fsPath);
	});

	it('Should choose correct msdb dacpac', async function (): Promise<void> {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.newProjectFileBaseline);
		const project = new Project(projFilePath);
		await project.readProjFile();

		let uri = project.getSystemDacpacUri(constants.msdbDacpac);
		should.equal(uri.fsPath, Uri.parse(path.join('$(NETCoreTargetsPath)', 'SystemDacpacs', '130', constants.msdbDacpac)).fsPath);

		project.changeDSP(TargetPlatform.Sql150.toString());
		uri = project.getSystemDacpacUri(constants.msdbDacpac);
		should.equal(uri.fsPath, Uri.parse(path.join('$(NETCoreTargetsPath)', 'SystemDacpacs', '150', constants.msdbDacpac)).fsPath);

		project.changeDSP(TargetPlatform.SqlAzureV12.toString());
		uri = project.getSystemDacpacUri(constants.msdbDacpac);
		should.equal(uri.fsPath, Uri.parse(path.join('$(NETCoreTargetsPath)', 'SystemDacpacs', 'AzureV12', constants.msdbDacpac)).fsPath);
	});

	it('Should throw error when choosing correct master dacpac if invalid DSP', async function (): Promise<void> {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.newProjectFileBaseline);
		const project = new Project(projFilePath);
		await project.readProjFile();

		project.changeDSP('invalidPlatform');
		await testUtils.shouldThrowSpecificError(async () => await project.getSystemDacpacUri(constants.masterDacpac), constants.invalidDataSchemaProvider);
	});

	it('Should add database references correctly', async function (): Promise<void> {
		projFilePath = await testUtils.createTestSqlProjFile(baselines.newProjectFileBaseline);
		const project = new Project(projFilePath);
		await project.readProjFile();

		should(project.databaseReferences.length).equal(0);
		await project.addSystemDatabaseReference(SystemDatabase.master);
		should(project.databaseReferences.length).equal(1);
		should(project.databaseReferences[0]).equal(constants.master);

		await project.addSystemDatabaseReference(SystemDatabase.msdb);
		should(project.databaseReferences.length).equal(2);
		should(project.databaseReferences[1]).equal(constants.msdb);

		await project.addDatabaseReference(Uri.parse('test.dacpac'), DatabaseReferenceLocation.sameDatabase, false);
		should(project.databaseReferences.length).equal(3);
		should(project.databaseReferences[2]).equal('test');
	});
});

describe('Project: round trip updates', function (): void {
	before(async function (): Promise<void> {
		await baselines.loadBaselines();
	});

	it('Should update SSDT project to work in ADS', async function (): Promise<void> {
		const fileBeforeUpdate = baselines.SSDTProjectFileBaseline;
		const fileAfterUpdate = isWindows ? baselines.SSDTProjectAfterUpdateBaselineWindows : baselines.SSDTProjectAfterUpdateBaseline;
		await testUpdateInRoundTrip(fileBeforeUpdate, fileAfterUpdate, true, true);
	});

	it('Should update SSDT project with new system database references', async function (): Promise<void> {
		const fileBeforeUpdate = isWindows ? baselines.SSDTUpdatedProjectBaselineWindows : baselines.SSDTUpdatedProjectBaseline;
		const fileAfterUpdate = isWindows ? baselines.SSDTUpdatedProjectAfterSystemDbUpdateBaselineWindows : baselines.SSDTUpdatedProjectAfterSystemDbUpdateBaseline;
		await testUpdateInRoundTrip(fileBeforeUpdate, fileAfterUpdate, false, true);
	});

	it('Should update SSDT project to work in ADS handling pre-exsiting targets', async function (): Promise<void> {
		await testUpdateInRoundTrip(baselines.SSDTProjectBaselineWithCleanTarget, baselines.SSDTProjectBaselineWithCleanTargetAfterUpdate, true, false);
	});
});

async function testUpdateInRoundTrip(fileBeforeupdate: string, fileAfterUpdate: string, testTargets: boolean, testReferences: boolean): Promise<void> {
	projFilePath = await testUtils.createTestSqlProjFile(fileBeforeupdate);
	const project: Project = new Project(projFilePath);
	await project.readProjFile();

	if (testTargets) {
		await testUpdateTargetsImportsRoundTrip(project);
	}

	if (testReferences) {
		await testAddReferencesInRoundTrip(project);
	}

	let projFileText = (await fs.readFile(projFilePath)).toString();
	should(projFileText).equal(fileAfterUpdate.trim());
}

async function testUpdateTargetsImportsRoundTrip(project: Project): Promise<void> {
	should(project.importedTargets.length).equal(2);
	await project.updateProjectForRoundTrip();
	should(await exists(projFilePath + '_backup')).equal(true);	// backup file should be generated before the project is updated
	should(project.importedTargets.length).equal(3);	// additional target added by updateProjectForRoundTrip method
}

async function testAddReferencesInRoundTrip(project: Project): Promise<void> {
	// updating system db refs is separate from updating for roundtrip because new db refs could be added even after project is updated for roundtrip
	should(project.containsSSDTOnlySystemDatabaseReferences()).equal(true);
	await project.updateSystemDatabaseReferencesInProjFile();
}
