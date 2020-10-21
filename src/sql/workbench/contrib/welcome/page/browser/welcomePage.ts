/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./welcomePage';
import 'sql/workbench/contrib/welcome/page/browser/az_data_welcome_page';
import { URI } from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import { ICommandService } from 'vs/platform/commands/common/commands';
import * as arrays from 'vs/base/common/arrays';
import { WalkThroughInput } from 'vs/workbench/contrib/welcome/walkThrough/browser/walkThroughInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { onUnexpectedError, isPromiseCanceledError } from 'vs/base/common/errors';
import { IWindowOpenable } from 'vs/platform/windows/common/windows';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { Action, WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Schemas } from 'vs/base/common/network';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { getInstalledExtensions, IExtensionStatus, onExtensionChanged, isKeymapExtension } from 'vs/workbench/contrib/extensions/common/extensionsUtils';
import { IExtensionManagementService, IExtensionGalleryService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionRecommendationsService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ILifecycleService, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { Disposable } from 'vs/base/common/lifecycle';
import { splitName } from 'vs/base/common/labels';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { buttonSecondaryBackground, buttonSecondaryBorder, buttonSecondary, buttonSecondaryHoverColor, tileBorder, disabledButton, disabledButtonBackground, gradientOne, gradientTwo, gradientBackground, extensionPackHeaderShadow, extensionPackGradientColorOneColor, extensionPackGradientColorTwoColor, tileBoxShadow, buttonDropdownBackgroundHover, hoverShadow } from 'sql/platform/theme/common/colorRegistry';
import { registerColor, foreground, textLinkActiveForeground, focusBorder, descriptionForeground, activeContrastBorder, buttonBackground, buttonForeground, menuBorder, menuForeground, menuSelectionForeground, editorWidgetBorder, selectBackground, buttonHoverBackground, selectBorder, iconForeground, textLinkForeground, inputBackground } from 'vs/platform/theme/common/colorRegistry';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { IEditorInputFactory, EditorInput } from 'vs/workbench/common/editor';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { TimeoutTimer } from 'vs/base/common/async';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ILabelService } from 'vs/platform/label/common/label';
import { IFileService } from 'vs/platform/files/common/files';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IRecentlyOpened, isRecentWorkspace, IRecentWorkspace, IRecentFolder, isRecentFolder, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IProductService } from 'vs/platform/product/common/productService';
import { KeyCode } from 'vs/base/common/keyCodes';
import { joinPath } from 'vs/base/common/resources';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { addStandardDisposableListener, EventHelper } from 'vs/base/browser/dom';

const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryFrom = 'welcomePage';

export class WelcomePageContribution implements IWorkbenchContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IBackupFileService private readonly backupFileService: IBackupFileService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		this.enableWelcomePage().catch(onUnexpectedError);
	}
	private async enableWelcomePage(): Promise<void> {
		const enabled = isWelcomePageEnabled(this.configurationService, this.contextService);
		if (enabled && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			const hasBackups: boolean = await this.backupFileService.hasBackups();
			const activeEditor = this.editorService.activeEditor;
			if (!activeEditor && !hasBackups) {
				const openWithReadme = this.configurationService.getValue(configurationKey) === 'readme';
				if (openWithReadme) {
					let readmes = await Promise.all(this.contextService.getWorkspace().folders.map(async folder => {
						const folderUri = folder.uri;
						try {
							const folder = await this.fileService.resolve(folderUri);
							const files = folder.children ? folder.children.map(child => child.name) : [];
							const file = arrays.find(files.sort(), file => strings.startsWith(file.toLowerCase(), 'readme'));
							if (file) {
								return joinPath(folderUri, file);
							}
						} catch (err) {
							onUnexpectedError(err);
						}
						return undefined;
					}));
					arrays.coalesceInPlace(readmes);
					if (!this.editorService.activeEditor) {
						if (readmes.length) {
							const isMarkDown = (readme: URI) => strings.endsWith(readme.path.toLowerCase(), '.md');
							await Promise.all([
								this.commandService.executeCommand('markdown.showPreview', null, readmes.filter(isMarkDown), { locked: true }),
								this.editorService.openEditors(readmes.filter(readme => !isMarkDown(readme))
									.map(readme => ({ resource: readme }))),
							]);
						} else {
							await this.instantiationService.createInstance(WelcomePage).openEditor();
						}
					}
				} else {
					await this.instantiationService.createInstance(WelcomePage).openEditor();
				}
			}
		}
	}
}

function isWelcomePageEnabled(configurationService: IConfigurationService, contextService: IWorkspaceContextService) {
	const startupEditor = configurationService.inspect(configurationKey);
	if (!startupEditor.userValue && !startupEditor.workspaceValue) {
		const welcomeEnabled = configurationService.inspect(oldConfigurationKey);
		if (welcomeEnabled.value !== undefined && welcomeEnabled.value !== null) {
			return welcomeEnabled.value;
		}
	}
	return startupEditor.value === 'welcomePage' || startupEditor.value === 'readme' || startupEditor.value === 'welcomePageInEmptyWorkbench' && contextService.getWorkbenchState() === WorkbenchState.EMPTY;
}

export class WelcomePageAction extends Action {

	public static readonly ID = 'workbench.action.showWelcomePage';
	public static readonly LABEL = localize('welcomePage', "Welcome");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): Promise<void> {
		return this.instantiationService.createInstance(WelcomePage)
			.openEditor()
			.then(() => undefined);
	}
}

interface ExtensionSuggestion {
	name: string;
	title?: string;
	description?: string;
	id: string;
	isKeymap?: boolean;
	isCommand?: boolean;
	isExtensionPack?: boolean;
	icon?: string;
	link?: string;
}


interface ExtensionPackExtensions {
	name: string;
	icon: string;
	link: string;
}

const extensionPacks: ExtensionSuggestion[] = [
	{
		name: localize('welcomePage.adminPack', "SQL Admin Pack"),
		title: localize('welcomePage.showAdminPack', "SQL Admin Pack"),
		description: localize('welcomePage.adminPackDescription', "Admin Pack for SQL Server is a collection of popular database administration extensions to help you manage SQL Server"),
		id: 'microsoft.admin-pack',
		isExtensionPack: true
	},
];

const extensionPackExtensions: ExtensionPackExtensions[] = [
	{ name: 'SQL Server Agent', icon: require.toUrl('./../../media/defaultExtensionIcon.svg'), link: `command:azdata.extension.open?{"id":"microsoft.agent"}` },
	{ name: 'SQL Server Profiler', icon: require.toUrl('./../../media/defaultExtensionIcon.svg'), link: `command:azdata.extension.open?{"id":"microsoft.profiler"}` },
	{ name: 'SQL Server Import', icon: require.toUrl('./../../media/defaultExtensionIcon.svg'), link: `command:azdata.extension.open?{"id":"microsoft.import"}` },
	{ name: 'SQL Server Dacpac', icon: require.toUrl('./../../media/defaultExtensionIcon.svg'), link: `command:azdata.extension.open?{"id":"microsoft.dacpac"}` }
];

const extensions: ExtensionSuggestion[] = [
	{ name: localize('welcomePage.powershell', "Powershell"), id: 'microsoft.powershell', description: localize('welcomePage.powershellDescription', "Write and execute PowerShell scripts using Azure Data Studio's rich query editor"), icon: 'https://raw.githubusercontent.com/PowerShell/vscode-powershell/master/images/PowerShell_icon.png', link: `command:azdata.extension.open?{"id":"microsoft.powershell"}` },
	{ name: localize('welcomePage.dataVirtualization', "Data Virtualization"), id: 'microsoft.datavirtualization', description: localize('welcomePage.dataVirtualizationDescription', "Virtualize data with SQL Server 2019 and create external tables using interactive wizards"), icon: require.toUrl('./../../media/defaultExtensionIcon.svg'), link: `command:azdata.extension.open?{"id":"microsoft.datavirtualization"}` },
	{ name: localize('welcomePage.PostgreSQL', "PostgreSQL"), id: 'microsoft.azuredatastudio-postgresql', description: localize('welcomePage.PostgreSQLDescription', "Connect, query, and manage Postgres databases with Azure Data Studio"), icon: 'https://raw.githubusercontent.com/Microsoft/azuredatastudio-postgresql/master/images/extension-icon.png', link: `command:azdata.extension.open?{"id":"microsoft.azuredatastudio-postgresql"}` },
];

const extensionPackStrings = {
	installEvent: 'installExtension',
	installedEvent: 'installedExtension',
	detailsEvent: 'detailsExtension',
	alreadyInstalled: (extensionName: string) => { return localize('welcomePage.extensionPackAlreadyInstalled', "Support for {0} is already installed.", extensionName); },
	reloadAfterInstall: (extensionName: string) => { return localize('welcomePage.willReloadAfterInstallingExtensionPack', "The window will reload after installing additional support for {0}.", extensionName); },
	installing: (extensionName: string) => { return localize('welcomePage.installingExtensionPack', "Installing additional support for {0}...", extensionName); },
	extensionNotFound: (extensionName: string, extensionId: string) => { return localize('welcomePage.extensionPackNotFound', "Support for {0} with id {1} could not be found.", extensionName, extensionId); },
};

const welcomeInputTypeId = 'workbench.editors.welcomePageInput';
class WelcomePage extends Disposable {
	readonly editorInput: WalkThroughInput;
	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspacesService private readonly workspacesService: IWorkspacesService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionRecommendationsService private readonly tipsService: IExtensionRecommendationsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IHostService private readonly hostService: IHostService,
		@IFileService fileService: IFileService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this._register(lifecycleService.onShutdown(() => this.dispose()));
		const recentlyOpened = this.workspacesService.getRecentlyOpened();
		const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
		const resource = URI.parse(require.toUrl('./az_data_welcome_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'sql/workbench/contrib/welcome/page/browser/az_data_welcome_page' })
			});
		this.editorInput = this.instantiationService.createInstance(WalkThroughInput, {
			typeId: welcomeInputTypeId,
			name: localize('welcome.title', "Welcome"),
			resource,
			telemetryFrom,
			onReady: (container: HTMLElement) => this.onReady(container, recentlyOpened, installedExtensions, fileService)
		});
	}
	public openEditor() {
		return this.editorService.openEditor(this.editorInput, { pinned: false });
	}
	private onReady(container: HTMLElement, recentlyOpened: Promise<IRecentlyOpened>, installedExtensions: Promise<IExtensionStatus[]>, fileService: IFileService): void {
		const enabled = isWelcomePageEnabled(this.configurationService, this.contextService);
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		if (enabled) {
			showOnStartup.setAttribute('checked', 'checked');
		}
		showOnStartup.addEventListener('click', e => {
			this.configurationService.updateValue(configurationKey, showOnStartup.checked ? 'welcomePage' : 'newUntitledFile', ConfigurationTarget.USER);
		});
		const prodName = container.querySelector('.welcomePage .title .caption') as HTMLElement;
		if (prodName) {
			prodName.innerHTML = this.productService.nameLong;
		}

		const welcomeContainerContainer = document.querySelector('.welcomePageContainer').parentElement as HTMLElement;
		const adsHomepage = document.querySelector('.ads_homepage') as HTMLElement;
		adsHomepage.classList.add('responsive-container');

		const observer = new MutationObserver(parseMutations);
		observer.observe(welcomeContainerContainer, {
			attributes: true,
			attributeFilter: ['style']
		});
		const defaultBreakpoints = { SM: 480, MD: 640, LG: 1024, XL: 1365 };
		const startingWidth = parseInt(welcomeContainerContainer.style.width);
		adsHomepage.classList.add('XS');
		Object.keys(defaultBreakpoints).forEach(function (breakpoint) {
			let minWidth = defaultBreakpoints[breakpoint];
			if (startingWidth >= minWidth) {
				adsHomepage.classList.add(breakpoint);
			}
			else {
				adsHomepage.classList.remove(breakpoint);
			}
		});

		function parseMutations() {
			const width = parseInt(welcomeContainerContainer.style.width);
			Object.keys(defaultBreakpoints).forEach(function (breakpoint) {
				let minWidth = defaultBreakpoints[breakpoint];
				if (width >= minWidth) {
					adsHomepage.classList.add(breakpoint);
				}
				else {
					adsHomepage.classList.remove(breakpoint);
				}
			});
		}

		recentlyOpened.then(async ({ workspaces }) => {
			// Filter out the current workspace
			workspaces = workspaces.filter(recent => !this.contextService.isCurrentWorkspace(isRecentWorkspace(recent) ? recent.workspace : recent.folderUri));
			if (!workspaces.length) {
				const recent = container.querySelector('.welcomePage') as HTMLElement;
				recent.classList.add('emptyRecent');
				return;
			}
			const ul = container.querySelector('.recent ul');
			if (!ul) {
				return;
			}
			const workspacesToShow = workspaces.slice(0, 5);
			const updateEntries = async () => {
				while (ul.firstChild) {
					ul.removeChild(ul.firstChild);
				}
				await this.mapListEntries(workspacesToShow, fileService);
			};
			await updateEntries();
			this._register(this.labelService.onDidChangeFormatters(updateEntries));
		}).then(undefined, onUnexpectedError);
		this.addExtensionList(container, '.extension_list');
		this.addExtensionPack(container, '.extensionPack');
		this.updateInstalledExtensions(container, installedExtensions);
		this._register(this.instantiationService.invokeFunction(onExtensionChanged)(ids => {
			for (const id of ids) {
				if (container.querySelector(`.installExtension[data-extension="${id.id}"], .enabledExtension[data-extension="${id.id}"]`)) {
					const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
					this.updateInstalledExtensions(container, installedExtensions);
					break;
				}
			}
		}));
		this.createDropDown();
		this.createWidePreviewToolTip();
		this.createPreviewModal();
	}

	private createWidePreviewToolTip() {
		const previewLink = document.querySelector('#tool_tip_container_wide') as HTMLElement;
		const tooltip = document.querySelector('#tooltip_text_wide') as HTMLElement;
		const previewModalBody = document.querySelector('.preview_tooltip_body') as HTMLElement;
		const previewModalHeader = document.querySelector('.preview_tooltip_header') as HTMLElement;

		addStandardDisposableListener(previewLink, 'mouseover', () => {
			tooltip.setAttribute('aria-hidden', 'true');
			tooltip.classList.toggle('show');
		});
		addStandardDisposableListener(previewLink, 'mouseout', () => {
			tooltip.setAttribute('aria-hidden', 'false');
			tooltip.classList.remove('show');
		});

		addStandardDisposableListener(previewLink, 'keydown', event => {
			if (event.equals(KeyCode.Escape)) {
				if (tooltip.classList.contains('show')) {
					tooltip.setAttribute('aria-hidden', 'true');
					tooltip.classList.remove('show');
				}
			}
			else if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				tooltip.setAttribute('aria-hidden', 'false');
				tooltip.classList.toggle('show');
				previewModalHeader.focus();
			}
		});

		addStandardDisposableListener(tooltip, 'keydown', event => {
			if (event.equals(KeyCode.Escape)) {
				if (tooltip.classList.contains('show')) {
					tooltip.setAttribute('aria-hidden', 'true');
					tooltip.classList.remove('show');
				}
			}
			else if (event.equals(KeyCode.Tab)) {
				EventHelper.stop(event);
				if (event.target === previewModalBody) {
					previewModalHeader.focus();
				} else {
					previewModalBody.focus();
				}
			}
		});

		window.addEventListener('click', (event) => {
			const target = event.target as HTMLTextAreaElement;
			if (!target.matches('.tooltip')) {
				if (tooltip.classList.contains('show')) {
					tooltip.classList.remove('show');
				}
			}
		});
	}

	private createDropDown() {
		const dropdownBtn = document.querySelector('#dropdown_btn') as HTMLElement;
		const dropdown = document.querySelector('#dropdown') as HTMLInputElement;

		addStandardDisposableListener(dropdownBtn, 'click', () => {
			dropdown.classList.toggle('show');
		});

		addStandardDisposableListener(dropdownBtn, 'keydown', event => {
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				const dropdownFirstElement = document.querySelector('#dropdown').firstElementChild.children[0] as HTMLInputElement;
				dropdown.classList.toggle('show');
				dropdownFirstElement.focus();
			}
		});

		addStandardDisposableListener(dropdown, 'keydown', event => {
			if (event.equals(KeyCode.Escape)) {
				if (dropdown.classList.contains('show')) {
					dropdown.classList.remove('show');
					const currentSelection = document.querySelector('.move:focus') as HTMLInputElement;
					currentSelection.blur();
				}
			}
		});

		const body = document.querySelector('body');

		if (body.classList.contains('windows') || body.classList.contains('linux')) {
			const macOnly = document.querySelector('#dropdown_mac_only');
			macOnly.remove();
		} else if (body.classList.contains('mac')) {
			const windowsLinuxOnly = document.querySelector('#dropdown_windows_linux_only');
			windowsLinuxOnly.remove();
		}

		window.addEventListener('click', (event) => {
			const target = event.target as HTMLTextAreaElement;
			if (!target.matches('.dropdown')) {
				if (dropdown.classList.contains('show')) {
					dropdown.classList.remove('show');
				}
			}
		});

		addStandardDisposableListener(dropdown, 'keydown', event => {
			const dropdownLastElement = document.querySelector('#dropdown').lastElementChild.children[0] as HTMLInputElement;
			const dropdownFirstElement = document.querySelector('#dropdown').firstElementChild.children[0] as HTMLInputElement;
			if (event.equals(KeyCode.Tab)) {
				EventHelper.stop(event);
				return;
			}
			else if (event.equals(KeyCode.UpArrow) || event.equals(KeyCode.LeftArrow)) {
				if (event.target === dropdownFirstElement) {
					dropdownLastElement.focus();
				} else {
					const movePrev = <HTMLElement>document.querySelector('.move:focus').parentElement.previousElementSibling.children[0] as HTMLElement;
					movePrev.focus();
				}
			}
			else if (event.equals(KeyCode.DownArrow) || event.equals(KeyCode.RightArrow)) {
				if (event.target === dropdownLastElement) {
					dropdownFirstElement.focus();
				} else {
					const moveNext = <HTMLElement>document.querySelector('.move:focus').parentElement.nextElementSibling.children[0] as HTMLElement;
					moveNext.focus();
				}
			}
		});
	}

	private createPreviewModal() {
		const modal = document.querySelector('#preview_modal') as HTMLElement;
		const btn = document.querySelector('#tool_tip_container_narrow') as HTMLElement;
		const span = document.querySelector('.close_icon') as HTMLElement;
		const previewModalHeader = document.querySelector('.preview_modal_header') as HTMLElement;



		btn.addEventListener('click', function () {
			modal.classList.toggle('show');
		});

		span.addEventListener('click', function () {
			modal.classList.remove('show');
		});

		window.addEventListener('click', (e: MouseEvent) => {
			if (e.target === modal && modal.classList.contains('show')) {
				modal.classList.remove('show');
			}
		});

		btn.addEventListener('keydown', (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);

			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				modal.classList.toggle('show');
				modal.setAttribute('aria-hidden', 'false');
				previewModalHeader.focus();
			}
			if (event.equals(KeyCode.Escape)) {
				if (modal.classList.contains('show')) {
					modal.setAttribute('aria-hidden', 'true');
					modal.classList.remove('show');
				}
			}
		});

		window.addEventListener('keydown', (e: KeyboardEvent) => {
			let event = new StandardKeyboardEvent(e);
			const target = e.target as HTMLTextAreaElement;
			if (!target.matches('.modal') && event.equals(KeyCode.Escape)) {
				if (modal.classList.contains('show')) {
					modal.setAttribute('aria-hidden', 'true');
					modal.classList.remove('show');
				}
			}
		});

		modal.addEventListener('keydown', function (e: KeyboardEvent) {
			const previewModalBody = document.querySelector('.preview_modal_body') as HTMLElement;
			const previewModalHeader = document.querySelector('.preview_modal_header') as HTMLElement;
			let event = new StandardKeyboardEvent(e);

			if (event.equals(KeyCode.Tab)) {
				e.preventDefault();
				if (e.target === previewModalBody) {
					previewModalHeader.focus();

				} else {
					previewModalBody.focus();
				}
			}
		});
	}

	private async createListEntries(fileService: IFileService, fullPath: URI, windowOpenable: IWindowOpenable, relativePath: string): Promise<HTMLElement[]> {
		let result: HTMLElement[] = [];
		const value = await fileService.resolve(fullPath);
		let date = new Date(value.mtime);
		let mtime: Date = date;
		const options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
		const lastOpened: string = mtime.toLocaleDateString(undefined, options);
		const { name, parentPath } = splitName(relativePath);
		const li = document.createElement('li');
		const icon = document.createElement('i');
		const a = document.createElement('a');
		const span = document.createElement('span');
		const ul = document.querySelector('.recent ul');

		icon.title = relativePath;
		a.innerText = name;
		a.title = relativePath;
		a.setAttribute('aria-label', localize('welcomePage.openFolderWithPath', "Open folder {0} with path {1}", name, parentPath));
		a.href = 'javascript:void(0)';
		a.addEventListener('click', e => {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'openRecentFolder',
				from: telemetryFrom
			});
			this.hostService.openWindow([windowOpenable], { forceNewWindow: e.ctrlKey || e.metaKey });
			e.preventDefault();
			e.stopPropagation();
		});
		icon.classList.add('themed_icon');
		li.appendChild(icon);
		li.appendChild(a);
		span.classList.add('path');
		span.classList.add('detail');
		span.innerText = lastOpened;
		span.title = relativePath;
		li.appendChild(span);
		ul.appendChild(li);
		result.push(li);
		return result;
	}

	private async mapListEntries(recents: (IRecentWorkspace | IRecentFolder)[], fileService: IFileService): Promise<HTMLElement[]> {
		const result: HTMLElement[] = [];
		for (let i = 0; i < recents.length; i++) {
			const recent = recents[i];
			let relativePath: string;
			let fullPath: URI;
			let windowOpenable: IWindowOpenable;
			if (isRecentFolder(recent)) {
				windowOpenable = { folderUri: recent.folderUri };
				relativePath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: true });
				fullPath = recent.folderUri;
			} else {
				relativePath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: true });
				windowOpenable = { workspaceUri: recent.workspace.configPath };
			}
			const elements = await this.createListEntries(fileService, fullPath, windowOpenable, relativePath);
			result.push(...elements);
		}
		return result;
	}

	private addExtensionList(container: HTMLElement, listSelector: string) {
		const list = container.querySelector(listSelector);
		if (list) {
			extensions.forEach((extension, i) => {
				const flexDivContainerClasses = ['flex', 'flex_a_center', 'extension_inner'];
				const outerAnchorContainerElm = document.createElement('a');
				const flexDivContainerElm = document.createElement('div');
				const descriptionContainerElm = document.createElement('div');
				const imgContainerElm = document.createElement('div');
				const iconElm = document.createElement('img');
				const pElm = document.createElement('p');
				const bodyElm = document.createElement('p');

				outerAnchorContainerElm.classList.add('extension');
				outerAnchorContainerElm.classList.add('tile');
				outerAnchorContainerElm.href = extension.link;
				flexDivContainerElm.classList.add(...flexDivContainerClasses);
				descriptionContainerElm.classList.add('description');
				imgContainerElm.classList.add('img_container');
				iconElm.classList.add('icon');
				pElm.classList.add('extension_header');

				iconElm.src = extension.icon;

				imgContainerElm.appendChild(iconElm);
				flexDivContainerElm.appendChild(imgContainerElm);
				flexDivContainerElm.appendChild(descriptionContainerElm);
				descriptionContainerElm.appendChild(pElm);
				descriptionContainerElm.appendChild(bodyElm);
				outerAnchorContainerElm.appendChild(flexDivContainerElm);
				pElm.innerText = extension.name;
				bodyElm.innerText = extension.description;
				list.appendChild(outerAnchorContainerElm);
			});
		}
	}

	private addExtensionPack(container: HTMLElement, anchorSelector: string) {
		const btnContainer = container.querySelector(anchorSelector);
		if (btnContainer) {
			extensionPacks.forEach((extension, i) => {
				const a = document.createElement('a');
				const classes = ['btn', 'btn_secondary', 'a_self_end', 'flex', 'flex_a_center', 'flex_j_center'];
				const btn = document.createElement('button');
				const description = document.querySelector('.extension_pack_body');
				const header = document.querySelector('.extension_pack_header');

				a.classList.add(...classes);
				a.innerText = localize('welcomePage.install', "Install");
				a.title = extension.title || (extension.isKeymap ? localize('welcomePage.installKeymap', "Install {0} keymap", extension.name) : localize('welcomePage.installExtensionPack', "Install additional support for {0}", extension.name));
				a.classList.add('installExtension');
				a.setAttribute('data-extension', extension.id);
				a.href = 'javascript:void(0)';
				a.addEventListener('click', e => {
					this.installExtension(extension);
					e.preventDefault();
					e.stopPropagation();
				});
				btnContainer.appendChild(a);
				btn.innerText = localize('welcomePage.installed', "Installed");
				btn.title = extension.isKeymap ? localize('welcomePage.installedKeymap', "{0} keymap is already installed", extension.name) : localize('welcomePage.installedExtensionPack', "{0} support is already installed", extension.name);
				btn.classList.add('enabledExtension');
				btn.classList.add(...classes);
				btn.setAttribute('disabled', 'true');
				btn.setAttribute('data-extension', extension.id);
				btnContainer.appendChild(btn);

				description.innerHTML = extension.description;
				header.innerHTML = extension.name;

				this.addExtensionPackList(container, '.extension_pack_extension_list');
			});
		}
	}

	private addExtensionPackList(container: HTMLElement, listSelector: string) {
		const list = container.querySelector(listSelector);
		if (list) {
			extensionPackExtensions.forEach((j) => {
				const outerContainerElem = document.createElement('div');
				const flexContainerElem = document.createElement('div');
				const iconContainerElem = document.createElement('img');
				const descriptionContainerElem = document.createElement('div');
				const pElem = document.createElement('p');
				const anchorElem = document.createElement('a');

				const outerContainerClasses = ['extension_pack_extension_container', 'flex', 'flex_j_center'];
				const flexContainerClasses = ['flex', 'flex_a_center'];

				anchorElem.href = j.link;

				outerContainerElem.classList.add(...outerContainerClasses);
				flexContainerElem.classList.add(...flexContainerClasses);
				iconContainerElem.classList.add('icon');
				pElem.classList.add('extension_pack_extension_list_header');
				descriptionContainerElem.classList.add('description');

				outerContainerElem.appendChild(flexContainerElem);
				flexContainerElem.appendChild(iconContainerElem);
				flexContainerElem.appendChild(descriptionContainerElem);
				descriptionContainerElem.appendChild(anchorElem);
				anchorElem.appendChild(pElem);

				pElem.innerText = j.name;
				iconContainerElem.src = j.icon;

				list.appendChild(outerContainerElem);
			});
		}
	}


	private installExtension(extensionSuggestion: ExtensionSuggestion): void {
		/* __GDPR__FRAGMENT__
			"WelcomePageInstall-1" : {
				"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog(extensionPackStrings.installEvent, {
			from: telemetryFrom,
			extensionId: extensionSuggestion.id,
		});
		this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const installedExtension = arrays.first(extensions, extension => areSameExtensions(extension.identifier, { id: extensionSuggestion.id }));
			if (installedExtension && installedExtension.globallyEnabled) {
				/* __GDPR__FRAGMENT__
					"WelcomePageInstalled-1" : {
						"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog(extensionPackStrings.installedEvent, {
					from: telemetryFrom,
					extensionId: extensionSuggestion.id,
					outcome: 'already_enabled',
				});
				this.notificationService.info(extensionPackStrings.alreadyInstalled(extensionSuggestion.name));
				return;
			}
			const foundAndInstalled = installedExtension ? Promise.resolve(installedExtension.local) : this.extensionGalleryService.query({ names: [extensionSuggestion.id], source: telemetryFrom }, CancellationToken.None)
				.then((result): null | Promise<ILocalExtension | null> => {
					const [extension] = result.firstPage;
					if (!extension) {
						return null;
					}
					return this.extensionManagementService.installFromGallery(extension)
						.then(() => this.extensionManagementService.getInstalled(ExtensionType.User))
						.then(installed => {
							const local = installed.filter(i => areSameExtensions(extension.identifier, i.identifier))[0];
							// TODO: Do this as part of the install to avoid multiple events.
							return this.extensionEnablementService.setEnablement([local], EnablementState.DisabledGlobally).then(() => local);
						});
				});

			this.notificationService.prompt(
				Severity.Info,
				extensionPackStrings.reloadAfterInstall(extensionSuggestion.name),
				[{
					label: localize('ok', "OK"),
					run: () => {
						const messageDelay = new TimeoutTimer();
						messageDelay.cancelAndSet(() => {
							this.notificationService.info(extensionPackStrings.reloadAfterInstall(extensionSuggestion.name));
						}, 300);
						const extensionsToDisable = extensions.filter(extension => isKeymapExtension(this.tipsService, extension) && extension.globallyEnabled).map(extension => extension.local);
						extensionsToDisable.length ? this.extensionEnablementService.setEnablement(extensionsToDisable, EnablementState.DisabledGlobally) : Promise.resolve()
							.then(() => {
								return foundAndInstalled.then(foundExtension => {
									messageDelay.cancel();
									if (foundExtension) {
										return this.extensionEnablementService.setEnablement([foundExtension], EnablementState.EnabledGlobally)
											.then(() => {
												/* __GDPR__FRAGMENT__
													"WelcomePageInstalled-2" : {
														"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
														"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
														"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
													}
												*/
												this.telemetryService.publicLog(extensionPackStrings.installedEvent, {
													from: telemetryFrom,
													extensionId: extensionSuggestion.id,
													outcome: installedExtension ? 'enabled' : 'installed',
												});
												return this.hostService.reload();
											});
									} else {
										/* __GDPR__FRAGMENT__
											"WelcomePageInstalled-3" : {
												"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
												"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
												"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
											}
										*/
										this.telemetryService.publicLog(extensionPackStrings.installedEvent, {
											from: telemetryFrom,
											extensionId: extensionSuggestion.id,
											outcome: 'not_found',
										});
										this.notificationService.info(extensionPackStrings.extensionNotFound(extensionSuggestion.name, extensionSuggestion.id));
										return undefined;
									}
								});
							}).then(undefined, err => {
								/* __GDPR__FRAGMENT__
									"WelcomePageInstalled-4" : {
										"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
									}
								*/
								this.telemetryService.publicLog(extensionPackStrings.installedEvent, {
									from: telemetryFrom,
									extensionId: extensionSuggestion.id,
									outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
								});
								this.notificationService.error(err);
							});
					}
				}, {
					label: localize('details', "Details"),
					run: () => {
						/* __GDPR__FRAGMENT__
							"WelcomePageDetails-1" : {
								"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog(extensionPackStrings.detailsEvent, {
							from: telemetryFrom,
							extensionId: extensionSuggestion.id,
						});
						this.extensionsWorkbenchService.queryGallery({ names: [extensionSuggestion.id] }, CancellationToken.None)
							.then(result => this.extensionsWorkbenchService.open(result.firstPage[0]))
							.then(undefined, onUnexpectedError);
					}
				}]
			);
		}).then(undefined, err => {
			/* __GDPR__FRAGMENT__
				"WelcomePageInstalled-6" : {
					"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryService.publicLog(extensionPackStrings.installedEvent, {
				from: telemetryFrom,
				extensionId: extensionSuggestion.id,
				outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
			});
			this.notificationService.error(err);
		});
	}

	private updateInstalledExtensions(container: HTMLElement, installedExtensions: Promise<IExtensionStatus[]>) {
		installedExtensions.then(extensions => {
			const elements = container.querySelectorAll('.installExtension, .enabledExtension');
			for (let i = 0; i < elements.length; i++) {
				elements[i].classList.remove('installed');
			}
			extensions.filter(ext => ext.globallyEnabled)
				.map(ext => ext.identifier.id)
				.forEach(id => {
					const install = container.querySelectorAll(`.installExtension[data-extension="${id}"]`);
					for (let i = 0; i < install.length; i++) {
						install[i].classList.add('installed');
					}
					const enabled = container.querySelectorAll(`.enabledExtension[data-extension="${id}"]`);
					for (let i = 0; i < enabled.length; i++) {
						enabled[i].classList.add('installed');
					}
				});
		}).then(undefined, onUnexpectedError);
	}
}

export class WelcomeInputFactory implements IEditorInputFactory {

	static readonly ID = welcomeInputTypeId;

	public canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	public serialize(editorInput: EditorInput): string {
		return '{}';
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): WalkThroughInput {
		return instantiationService.createInstance(WelcomePage)
			.editorInput;
	}
}

// theming
export const welcomePageBackground = registerColor('welcomePage.background', { light: null, dark: null, hc: null }, localize('welcomePage.background', 'Background color for the Welcome page.'));


registerThemingParticipant((theme, collector) => {

	const backgroundColor = theme.getColor(welcomePageBackground);
	if (backgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer { background-color: ${backgroundColor}; }`);
	}
	const tileBackgroundColor = theme.getColor(inputBackground);
	if (tileBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .tile:not(.extension):not(.extension_pack) { background-color: ${tileBackgroundColor};  }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .tool_tip .tool_tip_text { background-color: ${tileBackgroundColor};  }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .modal_content { background-color: ${tileBackgroundColor};  }`);
	}
	const tileBorderColor = theme.getColor(tileBorder);
	if (tileBorderColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .tile:not(.extension):not(.extension_pack) { border-color: ${tileBorderColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .tool_tip .tool_tip_text:after { border-color: transparent transparent ${tileBorderColor}; transparent }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .tool_tip .tool_tip_text { border: 1px solid ${tileBorderColor};  }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .modal_content { border: 1px solid ${tileBorderColor};  }`);
	}
	const tileBoxShadowColor = theme.getColor(tileBoxShadow);
	if (tileBoxShadowColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .tile:not(.extension):not(.extension_pack) { box-shadow: 0px 1px 4px ${tileBoxShadowColor}; }`);
	}
	const buttonPrimaryBackgroundColor = theme.getColor(buttonBackground);
	if (buttonPrimaryBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_primary { background-color: ${buttonPrimaryBackgroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_primary { border-color: ${buttonPrimaryBackgroundColor};}`);
	}
	const buttonForegroundColor = theme.getColor(buttonForeground);
	if (buttonForegroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_primary { color: ${buttonForegroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .icon_arrow_down:before { color: ${buttonForegroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .extension_pack_body { color: ${buttonForegroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .extension_pack_header { color: ${buttonForegroundColor};}`);
	}
	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_primary:hover { background: ${buttonHoverBackgroundColor};}`);
	}
	const buttonSecondaryBackgroundColor = theme.getColor(buttonSecondaryBackground);
	if (buttonSecondaryBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_secondary { background-color: ${buttonSecondaryBackgroundColor};}`);
	}
	const buttonSecondaryBorderColor = theme.getColor(buttonSecondaryBorder);
	if (buttonSecondaryBorderColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_secondary { border: 1px solid ${buttonSecondaryBorderColor};}`);
	}
	const buttonSecondaryColor = theme.getColor(buttonSecondary);
	if (buttonSecondaryColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_secondary { color: ${buttonSecondaryColor};}`);
	}
	const buttonSecondaryHover = theme.getColor(buttonSecondaryHoverColor);
	if (buttonSecondaryColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_secondary:hover { color: ${buttonSecondaryHover}; border: 1px solid ${buttonSecondaryHover};}`);
	}
	const selectBackgroundColor = theme.getColor(selectBackground);
	if (selectBackgroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content { background: ${selectBackgroundColor};}`);
	}
	const menuForegroundColor = theme.getColor(menuForeground);
	if (menuForegroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content a { color: ${menuForegroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .icon_arrow_down_dark:before { color: ${menuForegroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage_section .history .moreRecent_list li.moreRecent a { color: ${menuForegroundColor};}`);
	}
	const hoverShadowColor = theme.getColor(hoverShadow);
	if (hoverShadowColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .tile:hover:not(.no_hover) { box-shadow: 0px 3px 8px ${hoverShadowColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content { box-shadow: 0px 4px 4px ${hoverShadowColor};}`);
	}
	const menuBorderColor = theme.getColor(menuBorder);
	if (menuBorderColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content a { border-color: ${menuBorderColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage .dropdown-content { border-color: ${menuBorderColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .btn_primary { border-color: ${menuBorderColor};}`);
	}
	const buttonDropdownBackgroundHoverColor = theme.getColor(buttonDropdownBackgroundHover);
	if (buttonDropdownBackgroundHoverColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content a:hover, .monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content a:focus { background: ${buttonDropdownBackgroundHoverColor};}`);
	}
	const buttonDropdownHoverColor = theme.getColor(menuSelectionForeground);
	if (buttonDropdownHoverColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content a:hover, .monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .dropdown-content a:focus { color: ${buttonDropdownHoverColor};}`);
	}
	const editorWidgetBorderColor = theme.getColor(editorWidgetBorder);
	if (editorWidgetBorderColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .tile.extension_pack { border-color: ${editorWidgetBorderColor};}`);
	}
	const extensionPackHeaderTextShadow = theme.getColor(extensionPackHeaderShadow);
	if (extensionPackHeaderTextShadow) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .extension_pack_header { text-shadow: 0px 4px 4px ${extensionPackHeaderTextShadow};}`);
	}
	const extensionPackGradientColorOne = theme.getColor(extensionPackGradientColorOneColor);
	const extensionPackGradientColorTwo = theme.getColor(extensionPackGradientColorTwoColor);
	if (extensionPackGradientColorOne && extensionPackGradientColorTwo) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .extension_pack_description:before { background-image: linear-gradient(0.49deg, ${extensionPackGradientColorOne} 82.75%, ${extensionPackGradientColorTwo});}`);
	}
	const selectBorderColor = theme.getColor(selectBorder);
	if (selectBorderColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage_section .history .list li:not(.moreRecent), .monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage_section .history .list_header_container, .monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage_section .pinned .list li:not(.moreRecent), .monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage_section .pinned .list_header_container { border-color: ${selectBorderColor};}`);
	}
	const descriptionColor = theme.getColor(descriptionForeground);
	if (descriptionColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .detail { color: ${descriptionColor}; }`);
	}
	const disabledButtonColor = theme.getColor(disabledButton);
	if (disabledButtonColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .btn:disabled { color: ${disabledButtonColor}; }`);
	}
	const disabledButtonBackgroundColor = theme.getColor(disabledButtonBackground);
	if (disabledButtonColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .btn:disabled { background: ${disabledButtonBackgroundColor}; }`);
	}
	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage h1, h2, h3, h4, h5, h6, h7, p { color: ${foregroundColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .ads_homepage .resources .label { color: ${foregroundColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .ads_homepage_section .history .list li a { color: ${foregroundColor};}`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .ads_homepage .resources .label { color: ${foregroundColor}; }`);
	}

	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage a:hover, .monaco-workbench .part.editor > .content .welcomePage a:active { color: ${activeLink}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .ads_homepage .themed_icon_alt { background-color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage a:focus { outline-color: ${focusColor}; }`);
	}
	const activeBorder = theme.getColor(activeContrastBorder);
	if (activeBorder) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .commands .item button:hover { outline-color: ${activeBorder}; }`);
	}
	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .ads_homepage #dropdown_btn:focus { outline-color: ${focusBorderColor}; }`);
	}
	const iconForegroundColor = theme.getColor(iconForeground);
	if (iconForegroundColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .entity { color: ${iconForegroundColor}; }`);
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePage .ads_homepage .themed_icon { background-color: ${iconForegroundColor}; }`);
	}
	const gradientOneColor = theme.getColor(gradientOne);
	const gradientTwoColor = theme.getColor(gradientTwo);
	const gradientBackgroundColor = theme.getColor(gradientBackground);
	if (gradientTwoColor && gradientOneColor) {
		collector.addRule(`.monaco-workbench .part.editor > .content .welcomePageContainer .ads_homepage .gradient { background-image: linear-gradient(0deg, ${gradientOneColor} 0%, ${gradientTwoColor} 100%); background-color: ${gradientBackgroundColor}}`);
	}
});
