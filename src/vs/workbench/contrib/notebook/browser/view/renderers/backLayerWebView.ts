/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as path from 'vs/base/common/path';
import { isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IOpenerService, matchesScheme } from 'vs/platform/opener/common/opener';
import { CELL_MARGIN, CELL_RUN_GUTTER } from 'vs/workbench/contrib/notebook/browser/constants';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { IProcessedOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import { asWebviewUri } from 'vs/workbench/contrib/webview/common/webviewUri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { dirname, joinPath } from 'vs/base/common/resources';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { getExtensionForMimeType } from 'vs/base/common/mime';

export interface WebviewIntialized {
	__vscode_notebook_message: boolean;
	type: 'initialized'
}

export interface IDimensionMessage {
	__vscode_notebook_message: boolean;
	type: 'dimension';
	id: string;
	data: DOM.Dimension;
}

export interface IMouseEnterMessage {
	__vscode_notebook_message: boolean;
	type: 'mouseenter';
	id: string;
}

export interface IMouseLeaveMessage {
	__vscode_notebook_message: boolean;
	type: 'mouseleave';
	id: string;
}

export interface IWheelMessage {
	__vscode_notebook_message: boolean;
	type: 'did-scroll-wheel';
	payload: any;
}


export interface IScrollAckMessage {
	__vscode_notebook_message: boolean;
	type: 'scroll-ack';
	data: { top: number };
	version: number;
}

export interface IBlurOutputMessage {
	__vscode_notebook_message: boolean;
	type: 'focus-editor';
	id: string;
	focusNext?: boolean;
}

export interface IClickedDataUrlMessage {
	__vscode_notebook_message: string;
	type: 'clicked-data-url';
	data: string;
	downloadName?: string;
}

export interface IClearMessage {
	type: 'clear';
}

export interface IFocusOutputMessage {
	type: 'focus-output';
	id: string;
}

export interface ICreationRequestMessage {
	type: 'html';
	content: string;
	id: string;
	outputId: string;
	top: number;
	left: number;
	initiallyHidden?: boolean;
}

export interface IContentWidgetTopRequest {
	id: string;
	top: number;
	left: number;
}

export interface IViewScrollTopRequestMessage {
	type: 'view-scroll';
	top?: number;
	widgets: IContentWidgetTopRequest[];
	version: number;
}

export interface IScrollRequestMessage {
	type: 'scroll';
	id: string;
	top: number;
	widgetTop?: number;
	version: number;
}

export interface IUpdatePreloadResourceMessage {
	type: 'preload';
	resources: string[];
	source: string;
}

interface ICachedInset {
	outputId: string;
	cell: CodeCellViewModel;
	preloads: ReadonlySet<string>;
	cachedCreation: ICreationRequestMessage;
}

function html(strings: TemplateStringsArray, ...values: any[]): string {
	let str = '';
	strings.forEach((string, i) => {
		str += string + (values[i] || '');
	});
	return str;
}

type IMessage = IDimensionMessage | IScrollAckMessage | IWheelMessage | IMouseEnterMessage | IMouseLeaveMessage | IBlurOutputMessage | WebviewIntialized | IClickedDataUrlMessage;

let version = 0;
export class BackLayerWebView extends Disposable {
	element: HTMLElement;
	webview!: WebviewElement;
	insetMapping: Map<IProcessedOutput, ICachedInset> = new Map();
	hiddenInsetMapping: Set<IProcessedOutput> = new Set();
	reversedInsetMapping: Map<string, IProcessedOutput> = new Map();
	preloadsCache: Map<string, boolean> = new Map();
	localResourceRootsCache: URI[] | undefined = undefined;
	rendererRootsCache: URI[] = [];
	kernelRootsCache: URI[] = [];
	private readonly _onMessage = this._register(new Emitter<any>());
	public readonly onMessage: Event<any> = this._onMessage.event;
	private _loaded!: Promise<void>;
	private _initalized: Promise<void>;
	private _disposed = false;

	constructor(
		public notebookEditor: INotebookEditor,
		public id: string,
		public documentUri: URI,
		@IWebviewService readonly webviewService: IWebviewService,
		@IOpenerService readonly openerService: IOpenerService,
		@INotebookService private readonly notebookService: INotebookService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this.element = document.createElement('div');

		this.element.style.width = `calc(100% - ${CELL_MARGIN * 2 + CELL_RUN_GUTTER}px)`;
		this.element.style.height = '1400px';
		this.element.style.position = 'absolute';
		this.element.style.margin = `0px 0 0px ${CELL_MARGIN + CELL_RUN_GUTTER}px`;

		const pathsPath = getPathFromAmdModule(require, 'vs/loader.js');
		const loader = asWebviewUri(this.workbenchEnvironmentService, this.id, URI.file(pathsPath));

		let coreDependencies = '';
		let resolveFunc: () => void;

		this._initalized = new Promise<void>((resolve, reject) => {
			resolveFunc = resolve;
		});

		const baseUrl = asWebviewUri(this.workbenchEnvironmentService, this.id, dirname(documentUri));

		if (!isWeb) {
			coreDependencies = `<script src="${loader}"></script>`;
			const htmlContent = this.generateContent(8, coreDependencies, baseUrl.toString());
			this.initialize(htmlContent);
			resolveFunc!();
		} else {
			fetch(pathsPath).then(async response => {
				if (response.status !== 200) {
					throw new Error(response.statusText);
				}

				const loaderJs = await response.text();

				coreDependencies = `
<script>
${loaderJs}
</script>
`;

				const htmlContent = this.generateContent(8, coreDependencies, baseUrl.toString());
				this.initialize(htmlContent);
				resolveFunc!();
			});
		}
	}

	generateContent(outputNodePadding: number, coreDependencies: string, baseUrl: string) {
		return html`
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<base href="${baseUrl}/"/>
				<style>
					#container > div > div {
						width: 100%;
						padding: ${outputNodePadding}px;
						box-sizing: border-box;
						background-color: var(--vscode-notebook-outputContainerBackgroundColor);
					}
					body {
						padding: 0px;
						height: 100%;
						width: 100%;
					}
				</style>
			</head>
			<body style="overflow: hidden;">
				<script>
					self.require = {};
				</script>
				${coreDependencies}
				<div id="__vscode_preloads"></div>
				<div id='container' class="widgetarea" style="position: absolute;width:100%;top: 0px"></div>
<script>
(function () {

		const handleInnerClick = (event) => {
			if (!event || !event.view || !event.view.document) {
				return;
			}

			/** @type {any} */
			let node = event.target;
			while (node) {
				if (node.tagName && node.tagName.toLowerCase() === 'a' && node.href) {
					if (node.href.startsWith('blob:')) {
						handleBlobUrlClick(node.href, node.download);
					}
					event.preventDefault();
					break;
				}
				node = node.parentNode;
			}
		};

		const handleBlobUrlClick = async (url, downloadName) => {
			try {
				const response = await fetch(url);
				const blob = await response.blob();
				const reader = new FileReader();
				reader.addEventListener('load', () => {
					const data = reader.result;

					vscode.postMessage({
						__vscode_notebook_message: true,
						type: 'clicked-data-url',
						data,
						downloadName
					});
				});
				reader.readAsDataURL(blob);
			} catch (e) {
				console.error(e.message);
			}
		};

		document.body.addEventListener('click', handleInnerClick);


	// eslint-disable-next-line no-undef
	const vscode = acquireVsCodeApi();

	const preservedScriptAttributes = {
		type: true,
		src: true,
		nonce: true,
		noModule: true,
		async: true
	};

	// derived from https://github.com/jquery/jquery/blob/d0ce00cdfa680f1f0c38460bc51ea14079ae8b07/src/core/DOMEval.js
	const domEval = (container) => {
		var arr = Array.from(container.getElementsByTagName('script'));
		for (let n = 0; n < arr.length; n++) {
			let node = arr[n];
			let scriptTag = document.createElement('script');
			scriptTag.text = node.innerText;
			for (let key in preservedScriptAttributes ) {
				const val = node[key] || node.getAttribute && node.getAttribute(key);
				if (val) {
					scriptTag.setAttribute(key, val);
				}
			}

			// TODO: should script with src not be removed?
			container.appendChild(scriptTag).parentNode.removeChild(scriptTag);
		}
	};

	let observers = [];

	const resizeObserve = (container, id) => {
		const resizeObserver = new ResizeObserver(entries => {
			for (let entry of entries) {
				if (entry.target.id === id && entry.contentRect) {
					vscode.postMessage({
							__vscode_notebook_message: true,
							type: 'dimension',
							id: id,
							data: {
								height: entry.contentRect.height + ${outputNodePadding} * 2
							}
						});
				}
			}
		});

		resizeObserver.observe(container);
		observers.push(resizeObserver);
	}

	function scrollWillGoToParent(event) {
		for (let node = event.target; node; node = node.parentNode) {
			if (node.id === 'container') {
				return false;
			}

			if (event.deltaY < 0 && node.scrollTop > 0) {
				return true;
			}

			if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
				return true;
			}
		}

		return false;
	}

	const handleWheel = (event) => {
		if (event.defaultPrevented || scrollWillGoToParent(event)) {
			return;
		}

		vscode.postMessage({
			__vscode_notebook_message: true,
			type: 'did-scroll-wheel',
			payload: {
				deltaMode: event.deltaMode,
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaZ: event.deltaZ,
				detail: event.detail,
				type: event.type
			}
		});
	};

	function focusFirstFocusableInCell(cellId) {
		const cellOutputContainer = document.getElementById(cellId);
		if (cellOutputContainer) {
			const focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea');
			focusableElement && focusableElement.focus();
		}
	}

	function createFocusSink(cellId, outputId, focusNext) {
		const element = document.createElement('div');
		element.tabIndex = 0;
		element.addEventListener('focus', () => {
			vscode.postMessage({
				__vscode_notebook_message: true,
				type: 'focus-editor',
				id: outputId,
				focusNext
			});

			setTimeout(() => { // Wait a tick to prevent the focus indicator blinking before webview blurs
				// Move focus off the focus sink - single use
				focusFirstFocusableInCell(cellId);
			}, 50);
		});

		return element;
	}

	window.addEventListener('wheel', handleWheel);

	window.addEventListener('message', event => {
		let id = event.data.id;

		switch (event.data.type) {
			case 'html':
				{
					let cellOutputContainer = document.getElementById(id);
					let outputId = event.data.outputId;
					if (!cellOutputContainer) {
						const container = document.getElementById('container');

						const upperWrapperElement = createFocusSink(id, outputId);
						container.appendChild(upperWrapperElement);

						let newElement = document.createElement('div');

						newElement.id = id;
						container.appendChild(newElement);
						cellOutputContainer = newElement;

						cellOutputContainer.addEventListener('mouseenter', () => {
							vscode.postMessage({
								__vscode_notebook_message: true,
								type: 'mouseenter',
								id: outputId,
								data: { }
							});
						});
						cellOutputContainer.addEventListener('mouseleave', () => {
							vscode.postMessage({
								__vscode_notebook_message: true,
								type: 'mouseleave',
								id: outputId,
								data: { }
							});
						});

						const lowerWrapperElement = createFocusSink(id, outputId, true);
						container.appendChild(lowerWrapperElement);
					}

					let outputNode = document.createElement('div');
					outputNode.style.position = 'absolute';
					outputNode.style.top = event.data.top + 'px';
					outputNode.style.left = event.data.left + 'px';
					outputNode.style.width = 'calc(100% - ' + event.data.left + 'px)';
					outputNode.style.minHeight = '32px';

					outputNode.id = outputId;
					let content = event.data.content;
					outputNode.innerHTML = content;
					cellOutputContainer.appendChild(outputNode);

					// eval
					domEval(outputNode);
					resizeObserve(outputNode, outputId);

					vscode.postMessage({
						__vscode_notebook_message: true,
						type: 'dimension',
						id: outputId,
						data: {
							height: outputNode.clientHeight
						}
					});

					// don't hide until after this step so that the height is right
					cellOutputContainer.style.display = event.data.initiallyHidden ? 'none' : 'block';
				}
				break;
			case 'view-scroll':
				{
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());

					for (let i = 0; i < event.data.widgets.length; i++) {
						let widget = document.getElementById(event.data.widgets[i].id);
						widget.style.top = event.data.widgets[i].top + 'px';
						widget.parentNode.style.display = 'block';
					}
					break;
				}
			case 'clear':
				document.getElementById('container').innerHTML = '';
				for (let i = 0; i < observers.length; i++) {
					observers[i].disconnect();
				}

				observers = [];
				break;
			case 'clearOutput':
				{
					let output = document.getElementById(id);
					if (output && output.parentNode) {
						document.getElementById(id).parentNode.removeChild(output);
					}
					// @TODO remove observer
				}
				break;
			case 'hideOutput':
				document.getElementById(id).parentNode.style.display = 'none';
				break;
			case 'showOutput':
				{
					let output = document.getElementById(id);
					output.parentNode.style.display = 'block';
					output.style.top = event.data.top + 'px';
				}
				break;
			case 'preload':
				let resources = event.data.resources;
				let preloadsContainer = document.getElementById('__vscode_preloads');
				for (let i = 0; i < resources.length; i++) {
					let scriptTag = document.createElement('script');
					scriptTag.setAttribute('src', resources[i]);
					preloadsContainer.appendChild(scriptTag)
				}
				break;
			case 'focus-output':
				{
					focusFirstFocusableInCell(id);
					break;
				}
		}
	});

	vscode.postMessage({
		__vscode_notebook_message: true,
		type: 'initialized'
	});
}());

</script>
</body>
`;
	}

	private resolveOutputId(id: string): { cell: CodeCellViewModel, output: IProcessedOutput } | undefined {
		const output = this.reversedInsetMapping.get(id);
		if (!output) {
			return undefined; // {{SQL CARBON EDIT}} strict-null-checks
		}

		return { cell: this.insetMapping.get(output)!.cell, output };
	}

	async initialize(content: string) {
		this.webview = this._createInset(this.webviewService, content);
		this.webview.mountTo(this.element);

		this._register(this.webview.onDidClickLink(link => {
			if (!link) {
				return;
			}

			if (matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.mailto)
				|| matchesScheme(link, Schemas.command)) {
				this.openerService.open(link, { fromUserGesture: true });
			}
		}));

		this._register(this.webview.onDidReload(() => {
			this.preloadsCache.clear();
			for (const [output, inset] of this.insetMapping.entries()) {
				this.updateRendererPreloads(inset.preloads);
				this.webview.sendMessage({ ...inset.cachedCreation, initiallyHidden: this.hiddenInsetMapping.has(output) });
			}
		}));

		this._register(this.webview.onMessage((data: IMessage) => {
			if (data.__vscode_notebook_message) {
				if (data.type === 'dimension') {
					let height = data.data.height;
					let outputHeight = height;

					const info = this.resolveOutputId(data.id);
					if (info) {
						const { cell, output } = info;
						let outputIndex = cell.outputs.indexOf(output);
						cell.updateOutputHeight(outputIndex, outputHeight);
						this.notebookEditor.layoutNotebookCell(cell, cell.layoutInfo.totalHeight);
					}
				} else if (data.type === 'mouseenter') {
					const info = this.resolveOutputId(data.id);
					if (info) {
						const { cell } = info;
						cell.outputIsHovered = true;
					}
				} else if (data.type === 'mouseleave') {
					const info = this.resolveOutputId(data.id);
					if (info) {
						const { cell } = info;
						cell.outputIsHovered = false;
					}
				} else if (data.type === 'scroll-ack') {
					// const date = new Date();
					// const top = data.data.top;
					// console.log('ack top ', top, ' version: ', data.version, ' - ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
				} else if (data.type === 'did-scroll-wheel') {
					this.notebookEditor.triggerScroll({
						...data.payload,
						preventDefault: () => { },
						stopPropagation: () => { }
					});
				} else if (data.type === 'focus-editor') {
					const info = this.resolveOutputId(data.id);
					if (info) {
						if (data.focusNext) {
							const idx = this.notebookEditor.viewModel?.getCellIndex(info.cell);
							if (typeof idx !== 'number') {
								return;
							}

							const newCell = this.notebookEditor.viewModel?.viewCells[idx + 1];
							if (!newCell) {
								return;
							}

							this.notebookEditor.focusNotebookCell(newCell, 'editor');
						} else {
							this.notebookEditor.focusNotebookCell(info.cell, 'editor');
						}
					}
				} else if (data.type === 'clicked-data-url') {
					this._onDidClickDataLink(data);
				}
				return;
			}

			this._onMessage.fire(data);
		}));
	}

	private async _onDidClickDataLink(event: IClickedDataUrlMessage): Promise<void> {
		const [splitStart, splitData] = event.data.split(';base64,');
		if (!splitData || !splitStart) {
			return;
		}

		const defaultDir = dirname(this.documentUri);
		let defaultName: string;
		if (event.downloadName) {
			defaultName = event.downloadName;
		} else {
			const mimeType = splitStart.replace(/^data:/, '');
			const candidateExtension = mimeType && getExtensionForMimeType(mimeType);
			defaultName = candidateExtension ? `download${candidateExtension}` : 'download';
		}

		const defaultUri = joinPath(defaultDir, defaultName);
		const newFileUri = await this.fileDialogService.showSaveDialog({
			defaultUri
		});
		if (!newFileUri) {
			return;
		}

		const decoded = atob(splitData);
		const typedArray = new Uint8Array(decoded.length);
		for (let i = 0; i < decoded.length; i++) {
			typedArray[i] = decoded.charCodeAt(i);
		}

		const buff = VSBuffer.wrap(typedArray);
		await this.fileService.writeFile(newFileUri, buff);
		await this.openerService.open(newFileUri);
	}

	async waitForInitialization() {
		await this._initalized;
	}

	private _createInset(webviewService: IWebviewService, content: string) {
		const rootPath = URI.file(path.dirname(getPathFromAmdModule(require, '')));
		const workspaceFolders = this.contextService.getWorkspace().folders.map(x => x.uri);

		this.localResourceRootsCache = [...this.notebookService.getNotebookProviderResourceRoots(), ...workspaceFolders, rootPath];

		const webview = webviewService.createWebviewElement(this.id, {
			enableFindWidget: false,
		}, {
			allowMultipleAPIAcquire: true,
			allowScripts: true,
			localResourceRoots: this.localResourceRootsCache
		}, undefined);

		let resolveFunc: () => void;
		this._loaded = new Promise<void>((resolve, reject) => {
			resolveFunc = resolve;
		});

		let dispose = webview.onMessage((data: IMessage) => {
			if (data.__vscode_notebook_message && data.type === 'initialized') {
				resolveFunc();
				dispose.dispose();
			}
		});

		webview.html = content;
		return webview;
	}

	shouldUpdateInset(cell: CodeCellViewModel, output: IProcessedOutput, cellTop: number) {
		if (this._disposed) {
			return undefined; // {{SQL CARBON EDIT}} strict-null-checks
		}

		let outputCache = this.insetMapping.get(output)!;
		let outputIndex = cell.outputs.indexOf(output);
		let outputOffset = cellTop + cell.getOutputOffset(outputIndex);

		if (this.hiddenInsetMapping.has(output)) {
			return true;
		}

		if (outputOffset === outputCache.cachedCreation.top) {
			return false;
		}

		return true;
	}

	updateViewScrollTop(top: number, items: { cell: CodeCellViewModel, output: IProcessedOutput, cellTop: number }[]) {
		if (this._disposed) {
			return;
		}

		let widgets: IContentWidgetTopRequest[] = items.map(item => {
			let outputCache = this.insetMapping.get(item.output)!;
			let id = outputCache.outputId;
			let outputIndex = item.cell.outputs.indexOf(item.output);

			let outputOffset = item.cellTop + item.cell.getOutputOffset(outputIndex);
			outputCache.cachedCreation.top = outputOffset;
			this.hiddenInsetMapping.delete(item.output);

			return {
				id: id,
				top: outputOffset,
				left: 0
			};
		});

		let message: IViewScrollTopRequestMessage = {
			top,
			type: 'view-scroll',
			version: version++,
			widgets: widgets
		};

		this.webview.sendMessage(message);
	}

	createInset(cell: CodeCellViewModel, output: IProcessedOutput, cellTop: number, offset: number, shadowContent: string, preloads: Set<string>) {
		if (this._disposed) {
			return;
		}

		this.updateRendererPreloads(preloads);
		let initialTop = cellTop + offset;

		if (this.insetMapping.has(output)) {
			let outputCache = this.insetMapping.get(output);

			if (outputCache) {
				this.hiddenInsetMapping.delete(output);
				this.webview.sendMessage({
					type: 'showOutput',
					id: outputCache.outputId,
					top: initialTop
				});
				return;
			}
		}

		let outputId = UUID.generateUuid();

		let message: ICreationRequestMessage = {
			type: 'html',
			content: shadowContent,
			id: cell.id,
			outputId: outputId,
			top: initialTop,
			left: 0
		};

		this.webview.sendMessage(message);
		this.insetMapping.set(output, { outputId: outputId, cell: cell, preloads, cachedCreation: message });
		this.hiddenInsetMapping.delete(output);
		this.reversedInsetMapping.set(outputId, output);
	}

	removeInset(output: IProcessedOutput) {
		if (this._disposed) {
			return;
		}

		let outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			return;
		}

		let id = outputCache.outputId;

		this.webview.sendMessage({
			type: 'clearOutput',
			id: id
		});
		this.insetMapping.delete(output);
		this.reversedInsetMapping.delete(id);
	}

	hideInset(output: IProcessedOutput) {
		if (this._disposed) {
			return;
		}

		let outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			return;
		}

		let id = outputCache.outputId;
		this.hiddenInsetMapping.add(output);

		this.webview.sendMessage({
			type: 'hideOutput',
			id: id
		});
	}

	clearInsets() {
		if (this._disposed) {
			return;
		}

		this.webview.sendMessage({
			type: 'clear'
		});

		this.insetMapping = new Map();
		this.reversedInsetMapping = new Map();
	}

	focusOutput(cellId: string) {
		if (this._disposed) {
			return;
		}

		this.webview.focus();
		setTimeout(() => { // Need this, or focus decoration is not shown. No clue.
			this.webview.sendMessage({
				type: 'focus-output',
				id: cellId
			});
		}, 50);
	}

	async updateKernelPreloads(extensionLocations: URI[], preloads: URI[]) {
		if (this._disposed) {
			return;
		}

		await this._loaded;

		let resources: string[] = [];
		preloads = preloads.map(preload => {
			if (this.environmentService.isExtensionDevelopment && (preload.scheme === 'http' || preload.scheme === 'https')) {
				return preload;
			}
			return asWebviewUri(this.workbenchEnvironmentService, this.id, preload);
		});

		preloads.forEach(e => {
			if (!this.preloadsCache.has(e.toString())) {
				resources.push(e.toString());
				this.preloadsCache.set(e.toString(), true);
			}
		});

		if (!resources.length) {
			return;
		}

		this.kernelRootsCache = [...extensionLocations, ...this.kernelRootsCache];
		this._updatePreloads(resources, 'kernel');
	}

	async updateRendererPreloads(preloads: ReadonlySet<string>) {
		if (this._disposed) {
			return;
		}

		await this._loaded;

		let resources: string[] = [];
		let extensionLocations: URI[] = [];
		preloads.forEach(preload => {
			let rendererInfo = this.notebookService.getRendererInfo(preload);

			if (rendererInfo) {
				let preloadResources = rendererInfo.preloads.map(preloadResource => {
					if (this.environmentService.isExtensionDevelopment && (preloadResource.scheme === 'http' || preloadResource.scheme === 'https')) {
						return preloadResource;
					}
					return asWebviewUri(this.workbenchEnvironmentService, this.id, preloadResource);
				});
				extensionLocations.push(rendererInfo.extensionLocation);
				preloadResources.forEach(e => {
					if (!this.preloadsCache.has(e.toString())) {
						resources.push(e.toString());
						this.preloadsCache.set(e.toString(), true);
					}
				});
			}
		});

		if (!resources.length) {
			return;
		}

		this.rendererRootsCache = extensionLocations;
		this._updatePreloads(resources, 'renderer');
	}

	private _updatePreloads(resources: string[], source: string) {
		const mixedResourceRoots = [...(this.localResourceRootsCache || []), ...this.rendererRootsCache, ...this.kernelRootsCache];

		this.webview.localResourcesRoot = mixedResourceRoots;

		let message: IUpdatePreloadResourceMessage = {
			type: 'preload',
			resources: resources,
			source: source
		};

		this.webview.sendMessage(message);
	}

	clearPreloadsCache() {
		this.preloadsCache.clear();
	}

	dispose() {
		this._disposed = true;
		super.dispose();
	}
}
