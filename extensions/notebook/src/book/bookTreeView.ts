/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as constants from '../common/constants';
import { IPrompter, QuestionTypes, IQuestion } from '../prompts/question';
import CodeAdapter from '../prompts/adapter';
import { BookTreeItem, BookTreeItemType } from './bookTreeItem';
import { BookModel } from './bookModel';
import { Deferred } from '../common/promise';
import { IBookTrustManager, BookTrustManager } from './bookTrustManager';
import * as loc from '../common/localizedConstants';
import { ApiWrapper } from '../common/apiWrapper';
import * as glob from 'fast-glob';
import { isNullOrUndefined } from 'util';
import { debounce } from '../common/utils';

const Content = 'content';

interface BookSearchResults {
	notebookPaths: string[];
	bookPaths: string[];
}

export class BookTreeViewProvider implements vscode.TreeDataProvider<BookTreeItem>, azdata.nb.NavigationProvider {
	private _onDidChangeTreeData: vscode.EventEmitter<BookTreeItem | undefined> = new vscode.EventEmitter<BookTreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<BookTreeItem | undefined> = this._onDidChangeTreeData.event;
	private _throttleTimer: any;
	private _resource: string;
	private _extensionContext: vscode.ExtensionContext;
	private prompter: IPrompter;
	private _initializeDeferred: Deferred<void> = new Deferred<void>();
	private _openAsUntitled: boolean;
	private _bookTrustManager: IBookTrustManager;

	private _bookViewer: vscode.TreeView<BookTreeItem>;
	public viewId: string;
	public books: BookModel[];
	public currentBook: BookModel;

	constructor(private _apiWrapper: ApiWrapper, workspaceFolders: vscode.WorkspaceFolder[], extensionContext: vscode.ExtensionContext, openAsUntitled: boolean, view: string, public providerId: string) {
		this._openAsUntitled = openAsUntitled;
		this._extensionContext = extensionContext;
		this.books = [];
		this.initialize(workspaceFolders).catch(e => console.error(e));
		this.viewId = view;
		this.prompter = new CodeAdapter();
		this._bookTrustManager = new BookTrustManager(this.books, _apiWrapper);

		this._extensionContext.subscriptions.push(azdata.nb.registerNavigationProvider(this));
	}

	private async initialize(workspaceFolders: vscode.WorkspaceFolder[]): Promise<void> {
		await Promise.all(workspaceFolders.map(async (workspaceFolder) => {
			try {
				await this.loadNotebooksInFolder(workspaceFolder.uri.fsPath);
			} catch {
				// no-op, not all workspace folders are going to be valid books
			}
		}));
		this._initializeDeferred.resolve();
	}

	public get initialized(): Promise<void> {
		return this._initializeDeferred.promise;
	}

	get _visitedNotebooks(): string[] {
		return this._extensionContext.globalState.get(constants.visitedNotebooksMementoKey, []);
	}

	set _visitedNotebooks(value: string[]) {
		this._extensionContext.globalState.update(constants.visitedNotebooksMementoKey, value);
	}

	trustBook(bookTreeItem?: BookTreeItem): void {
		let bookPathToTrust = bookTreeItem ? bookTreeItem.root : this.currentBook?.bookPath;
		if (bookPathToTrust) {
			let trustChanged = this._bookTrustManager.setBookAsTrusted(bookPathToTrust);
			if (trustChanged) {
				let notebookDocuments = this._apiWrapper.getNotebookDocuments();
				if (notebookDocuments) {
					// update trust state of opened items
					notebookDocuments.forEach(document => {
						let notebook = this.currentBook?.getNotebook(document.uri.fsPath);
						if (notebook && this._bookTrustManager.isNotebookTrustedByDefault(document.uri.fsPath)) {
							document.setTrusted(true);
						}
					});
				}
				this._apiWrapper.showInfoMessage(loc.msgBookTrusted);
			} else {
				this._apiWrapper.showInfoMessage(loc.msgBookAlreadyTrusted);
			}
		}
	}

	async openBook(bookPath: string, urlToOpen?: string, showPreview?: boolean, isNotebook?: boolean): Promise<void> {
		try {
			// Convert path to posix style for easier comparisons
			bookPath = bookPath.replace(/\\/g, '/');

			// Check if the book is already open in viewlet.
			let existingBook = this.books.find(book => book.bookPath === bookPath);
			if (existingBook?.bookItems.length > 0) {
				this.currentBook = existingBook;
			} else {
				await this.createAndAddBookModel(bookPath, !!isNotebook);
				this.currentBook = this.books.find(book => book.bookPath === bookPath);
			}

			if (showPreview) {
				this._bookViewer.reveal(this.currentBook.bookItems[0], { expand: vscode.TreeItemCollapsibleState.Expanded, focus: true, select: true });
				await this.showPreviewFile(urlToOpen);
			}

			// add file watcher on toc file.
			if (!isNotebook) {
				fs.watchFile(path.join(bookPath, '_data', 'toc.yml'), async (curr, prev) => {
					if (curr.mtime > prev.mtime) {
						let book = this.books.find(book => book.bookPath === bookPath);
						if (book) {
							this.fireBookRefresh(book);
						}
					}
				});
			}
		} catch (e) {
			vscode.window.showErrorMessage(loc.openFileError(bookPath, e instanceof Error ? e.message : e));
		}
	}

	@debounce(1500)
	async fireBookRefresh(book: BookModel): Promise<void> {
		await book.initializeContents().then(() => {
			this._onDidChangeTreeData.fire(undefined);
		});
	}

	async closeBook(book: BookTreeItem): Promise<void> {
		// remove book from the saved books
		let deletedBook: BookModel;
		try {
			let targetPath = book.book.type === BookTreeItemType.Book ? book.root : book.book.contentPath;
			let targetBook = this.books.find(b => b.bookPath === targetPath);
			let index: number = this.books.indexOf(targetBook);
			if (index > -1) {
				deletedBook = this.books.splice(index, 1)[0];
				if (this.currentBook === deletedBook) {
					this.currentBook = this.books.length > 0 ? this.books[this.books.length - 1] : undefined;
				}
				this._onDidChangeTreeData.fire(undefined);
			}
		} catch (e) {
			vscode.window.showErrorMessage(loc.closeBookError(book.root, e instanceof Error ? e.message : e));
		} finally {
			// remove watch on toc file.
			if (deletedBook && !deletedBook.isNotebook) {
				fs.unwatchFile(path.join(deletedBook.bookPath, '_data', 'toc.yml'));
			}
		}
	}

	/**
	 * Creates a model for the specified folder path and adds it to the known list of books if we
	 * were able to successfully parse it.
	 * @param bookPath The path to the book folder to create the model for
	 */
	private async createAndAddBookModel(bookPath: string, isNotebook: boolean): Promise<void> {
		const book: BookModel = new BookModel(bookPath, this._openAsUntitled, isNotebook, this._extensionContext);
		await book.initializeContents();
		this.books.push(book);
		if (!this.currentBook) {
			this.currentBook = book;
		}
		this._bookViewer = this._apiWrapper.createTreeView(this.viewId, { showCollapseAll: true, treeDataProvider: this });
		this._bookViewer.onDidChangeVisibility(e => {
			if (e.visible) {
				this.revealActiveDocumentInViewlet();
			}
		});
	}

	async showPreviewFile(urlToOpen?: string): Promise<void> {
		if (this.currentBook) {
			const bookRoot = this.currentBook.bookItems[0];
			const sectionToOpen = bookRoot.findChildSection(urlToOpen);
			const urlPath = sectionToOpen ? sectionToOpen.url : bookRoot.tableOfContents.sections[0].url;
			const sectionToOpenMarkdown: string = path.join(this.currentBook.bookPath, Content, urlPath.concat('.md'));
			// The Notebook editor expects a posix path for the resource (it will still resolve to the correct fsPath based on OS)
			const sectionToOpenNotebook: string = path.posix.join(this.currentBook.bookPath, Content, urlPath.concat('.ipynb'));
			if (await fs.pathExists(sectionToOpenMarkdown)) {
				this.openMarkdown(sectionToOpenMarkdown);
			}
			else if (await fs.pathExists(sectionToOpenNotebook)) {
				await this.openNotebook(sectionToOpenNotebook);
			}
		}
	}

	async openNotebook(resource: string): Promise<void> {
		try {
			await vscode.commands.executeCommand(constants.BuiltInCommands.SetContext, constants.unsavedBooksContextKey, false);
			if (this._openAsUntitled) {
				await this.openNotebookAsUntitled(resource);
			} else {
				// let us keep a list of already visited notebooks so that we do not trust them again, potentially
				// overriding user changes
				let normalizedResource = path.normalize(resource);

				if (this._visitedNotebooks.indexOf(normalizedResource) === -1
					&& this._bookTrustManager.isNotebookTrustedByDefault(normalizedResource)) {
					let openDocumentListenerUnsubscriber = azdata.nb.onDidOpenNotebookDocument((document: azdata.nb.NotebookDocument) => {
						document.setTrusted(true);
						this._visitedNotebooks = this._visitedNotebooks.concat([normalizedResource]);
						openDocumentListenerUnsubscriber.dispose();
					});
				}
				azdata.nb.showNotebookDocument(vscode.Uri.file(resource));
			}
		} catch (e) {
			vscode.window.showErrorMessage(loc.openNotebookError(resource, e instanceof Error ? e.message : e));
		}
	}

	async revealActiveDocumentInViewlet(uri?: vscode.Uri, shouldReveal: boolean = true): Promise<void> {
		let bookItem: BookTreeItem;
		// If no uri is passed in, try to use the current active notebook editor
		if (!uri) {
			let openDocument = azdata.nb.activeNotebookEditor;
			if (openDocument) {
				bookItem = this.currentBook?.getNotebook(openDocument.document.uri.fsPath);
			}
		} else if (uri.fsPath) {
			bookItem = this.currentBook?.getNotebook(uri.fsPath);
		}
		if (bookItem) {
			// Select + focus item in viewlet if books viewlet is already open, or if we pass in variable
			if (shouldReveal || this._bookViewer.visible) {
				// Note: 3 is the maximum number of levels that the vscode APIs let you expand to
				await this._bookViewer.reveal(bookItem, { select: true, focus: true, expand: 3 });
			}
		}
	}

	openMarkdown(resource: string): void {
		this.runThrottledAction(resource, () => {
			try {
				vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(resource));
			} catch (e) {
				vscode.window.showErrorMessage(loc.openMarkdownError(resource, e instanceof Error ? e.message : e));
			}
		});
	}

	async openNotebookAsUntitled(resource: string): Promise<void> {
		try {
			await vscode.commands.executeCommand(constants.BuiltInCommands.SetContext, constants.unsavedBooksContextKey, true);
			let untitledFileName: vscode.Uri = this.getUntitledNotebookUri(resource);
			vscode.workspace.openTextDocument(resource).then((document) => {
				let initialContent = document.getText();
				azdata.nb.showNotebookDocument(untitledFileName, {
					connectionProfile: null,
					initialContent: initialContent,
					initialDirtyState: false
				});
			});
		} catch (e) {
			vscode.window.showErrorMessage(loc.openUntitledNotebookError(resource, e instanceof Error ? e.message : e));
		}
	}

	async saveJupyterBooks(): Promise<void> {
		if (this.currentBook?.bookPath) {
			const allFilesFilter = loc.allFiles;
			let filter: any = {};
			filter[allFilesFilter] = '*';
			let uris = await vscode.window.showOpenDialog({
				filters: filter,
				canSelectFiles: false,
				canSelectMany: false,
				canSelectFolders: true,
				openLabel: loc.labelSelectFolder
			});
			if (uris && uris.length > 0) {
				let pickedFolder = uris[0];
				let destinationUri: vscode.Uri = vscode.Uri.file(path.join(pickedFolder.fsPath, path.basename(this.currentBook.bookPath)));
				if (destinationUri) {
					if (await fs.pathExists(destinationUri.fsPath)) {
						let doReplace = await this.confirmReplace();
						if (!doReplace) {
							return undefined;
						}
						else {
							//remove folder if exists
							await fs.remove(destinationUri.fsPath);
						}
					}
					//make directory for each contribution book.
					await fs.mkdir(destinationUri.fsPath);
					await fs.copy(this.currentBook.bookPath, destinationUri.fsPath);

					//remove book from the untitled books and open it from Saved books
					let untitledBookIndex: number = this.books.indexOf(this.currentBook);
					if (untitledBookIndex > -1) {
						this.books.splice(untitledBookIndex, 1);
						this.currentBook = undefined;
						this._onDidChangeTreeData.fire(undefined);
						vscode.commands.executeCommand('bookTreeView.openBook', destinationUri.fsPath, false, undefined);
					}
				}
			}
		}
	}

	public async searchJupyterBooks(treeItem?: BookTreeItem): Promise<void> {
		let folderToSearch: string;
		if (treeItem && treeItem.book.type !== BookTreeItemType.Notebook) {
			if (treeItem.uri) {
				folderToSearch = path.join(treeItem.root, Content, path.dirname(treeItem.uri));
			} else {
				folderToSearch = path.join(treeItem.root, Content);
			}
		} else if (this.currentBook && !this.currentBook.isNotebook) {
			folderToSearch = path.join(this.currentBook.bookPath, Content);
		} else {
			vscode.window.showErrorMessage(loc.noBooksSelectedError);
		}

		if (folderToSearch) {
			let filesToIncludeFiltered = path.join(folderToSearch, '**', '*.md') + ',' + path.join(folderToSearch, '**', '*.ipynb');
			vscode.commands.executeCommand('workbench.action.findInFiles', { filesToInclude: filesToIncludeFiltered, query: '' });
		}
	}

	public async openNewBook(): Promise<void> {
		const allFilesFilter = loc.allFiles;
		let filter: any = {};
		filter[allFilesFilter] = '*';
		let uris = await vscode.window.showOpenDialog({
			filters: filter,
			canSelectFiles: false,
			canSelectMany: false,
			canSelectFolders: true,
			openLabel: loc.labelBookFolder
		});
		if (uris && uris.length > 0) {
			let bookPath = uris[0];
			await this.openBook(bookPath.fsPath, undefined, true);
		}
	}

	public async openNotebookFolder(): Promise<void> {
		const allFilesFilter = loc.allFiles;
		let filter: any = {};
		filter[allFilesFilter] = '*';
		let uris = await vscode.window.showOpenDialog({
			filters: filter,
			canSelectFiles: false,
			canSelectMany: false,
			canSelectFolders: true,
			openLabel: loc.labelSelectFolder
		});
		if (uris && uris.length > 0) {
			await this.loadNotebooksInFolder(uris[0]?.fsPath);
		}
	}

	public async loadNotebooksInFolder(folderPath: string) {
		let bookCollection = await this.getNotebooksInTree(folderPath);
		for (let i = 0; i < bookCollection.bookPaths.length; i++) {
			await this.openBook(bookCollection.bookPaths[i], undefined, false);
		}
		for (let i = 0; i < bookCollection.notebookPaths.length; i++) {
			await this.openBook(bookCollection.notebookPaths[i], undefined, false, true);
		}
	}

	private async getNotebooksInTree(folderPath: string): Promise<BookSearchResults> {
		let notebookConfig = vscode.workspace.getConfiguration(constants.notebookConfigKey);
		let maxDepth = notebookConfig[constants.maxBookSearchDepth];
		// Use default value if user enters an invalid value
		if (isNullOrUndefined(maxDepth) || maxDepth < 0) {
			maxDepth = 10;
		} else if (maxDepth === 0) { // No limit of search depth if user enters 0
			maxDepth = undefined;
		}

		let escapedPath = glob.escapePath(folderPath.replace(/\\/g, '/'));
		let bookFilter = path.posix.join(escapedPath, '**', '_data', 'toc.yml');
		let bookPaths = await glob(bookFilter, { deep: maxDepth });
		let tocTrimLength = '/_data/toc.yml'.length * -1;
		bookPaths = bookPaths.map(path => path.slice(0, tocTrimLength));

		let notebookFilter = path.posix.join(escapedPath, '**', '*.ipynb');
		let notebookPaths = await glob(notebookFilter, { ignore: bookPaths.map(path => glob.escapePath(path) + '/**/*.ipynb'), deep: maxDepth });

		return { notebookPaths: notebookPaths, bookPaths: bookPaths };
	}

	private runThrottledAction(resource: string, action: () => void) {
		const isResourceChange = resource !== this._resource;
		if (isResourceChange) {
			this.clearAndResetThrottleTimer();
		}

		this._resource = resource;

		// Schedule update if none is pending
		if (!this._throttleTimer) {
			if (isResourceChange) {
				action();
			} else {
				this._throttleTimer = setTimeout(() => {
					action();
					this.clearAndResetThrottleTimer();
				}, 300);
			}
		}
	}

	private clearAndResetThrottleTimer(): void {
		clearTimeout(this._throttleTimer);
		this._throttleTimer = undefined;
	}

	openExternalLink(resource: string): void {
		try {
			vscode.env.openExternal(vscode.Uri.parse(resource));
		} catch (e) {
			vscode.window.showErrorMessage(loc.openExternalLinkError(resource, e instanceof Error ? e.message : e));
		}
	}

	getTreeItem(element: BookTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: BookTreeItem): Thenable<BookTreeItem[]> {
		if (element) {
			if (element.sections) {
				return Promise.resolve(this.currentBook.getSections(element.tableOfContents, element.sections, element.root).then(sections => { return sections; }));
			} else {
				return Promise.resolve([]);
			}
		} else {
			let bookItems: BookTreeItem[] = [];
			this.books.map(book => {
				bookItems = bookItems.concat(book.bookItems);
			});
			return Promise.resolve(bookItems);
		}
	}

	getParent(element?: BookTreeItem): vscode.ProviderResult<BookTreeItem> {
		if (element) {
			let parentPath;
			if (element.root.endsWith('.md')) {
				parentPath = path.join(this.currentBook.bookPath, Content, 'readme.md');
				if (parentPath === element.root) {
					return undefined;
				}
			}
			else if (element.root.endsWith('.ipynb')) {
				let baseName: string = path.basename(element.root);
				parentPath = element.root.replace(baseName, 'readme.md');
			}
			else {
				return undefined;
			}
			return this.currentBook.getAllNotebooks().get(parentPath);
		} else {
			return undefined;
		}
	}

	getUntitledNotebookUri(resource: string): vscode.Uri {
		let untitledFileName = vscode.Uri.parse(`untitled:${resource}`);
		if (!this.currentBook.getAllNotebooks().get(untitledFileName.fsPath) && !this.currentBook.getAllNotebooks().get(path.basename(untitledFileName.fsPath))) {
			let notebook = this.currentBook.getAllNotebooks().get(resource);
			this.currentBook.getAllNotebooks().set(path.basename(untitledFileName.fsPath), notebook);
		}
		return untitledFileName;
	}

	//Confirmation message dialog
	private async confirmReplace(): Promise<boolean> {
		return await this.prompter.promptSingle<boolean>(<IQuestion>{
			type: QuestionTypes.confirm,
			message: loc.confirmReplace,
			default: false
		});
	}

	getNavigation(uri: vscode.Uri): Thenable<azdata.nb.NavigationResult> {
		let result: azdata.nb.NavigationResult;
		let notebook = this.currentBook?.getNotebook(uri.fsPath);
		if (notebook) {
			result = {
				hasNavigation: true,
				previous: notebook.previousUri ?
					this.currentBook?.openAsUntitled ? this.getUntitledNotebookUri(notebook.previousUri) : vscode.Uri.file(notebook.previousUri) : undefined,
				next: notebook.nextUri ? this.currentBook?.openAsUntitled ? this.getUntitledNotebookUri(notebook.nextUri) : vscode.Uri.file(notebook.nextUri) : undefined
			};
		} else {
			result = {
				hasNavigation: false,
				previous: undefined,
				next: undefined
			};
		}
		return Promise.resolve(result);
	}

	public getBookFromItemPath(itemPath: string): BookModel | undefined {
		let selectedBook = this.books.find(b => itemPath.toLowerCase().indexOf(b.bookPath.toLowerCase()) > -1);
		return selectedBook;
	}
}
