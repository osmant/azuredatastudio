/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//#region --- editor/workbench core

import 'vs/editor/editor.all';

import 'vs/workbench/api/browser/extensionHost.contribution';
import 'sql/workbench/api/browser/extensionHost.contribution'; // {{SQL CARBON EDIT}} @anthonydresser add our extension contributions
import 'vs/workbench/browser/workbench.contribution';

//#endregion


//#region --- workbench actions

import 'vs/workbench/browser/actions/textInputActions';
import 'vs/workbench/browser/actions/developerActions';
import 'vs/workbench/browser/actions/helpActions';
import 'vs/workbench/browser/actions/layoutActions';
import 'vs/workbench/browser/actions/listCommands';
import 'vs/workbench/browser/actions/navigationActions';
import 'vs/workbench/browser/actions/windowActions';
import 'vs/workbench/browser/actions/workspaceActions';
import 'vs/workbench/browser/actions/workspaceCommands';

import 'vs/workbench/browser/parts/quickopen/quickOpenActions';
import 'vs/workbench/browser/parts/quickinput/quickInputActions';

//#endregion


//#region --- API Extension Points

import 'vs/workbench/api/common/menusExtensionPoint';
import 'vs/workbench/api/common/configurationExtensionPoint';
import 'vs/workbench/api/browser/viewsExtensionPoint';

//#endregion


//#region --- workbench parts

import 'vs/workbench/browser/parts/quickinput/quickInput';
import 'vs/workbench/browser/parts/quickopen/quickOpenController';
import 'vs/workbench/browser/parts/titlebar/titlebarPart';
import 'vs/workbench/browser/parts/editor/editorPart';
import 'vs/workbench/browser/parts/activitybar/activitybarPart';
import 'vs/workbench/browser/parts/panel/panelPart';
import 'vs/workbench/browser/parts/sidebar/sidebarPart';
import 'vs/workbench/browser/parts/statusbar/statusbarPart';
import 'vs/workbench/browser/parts/views/views';

//#endregion


//#region --- workbench services

import 'vs/workbench/services/extensions/browser/extensionUrlHandler';
import 'vs/workbench/services/bulkEdit/browser/bulkEditService';
import 'vs/workbench/services/keybinding/common/keybindingEditing';
import 'vs/workbench/services/decorations/browser/decorationsService';
import 'vs/workbench/services/progress/browser/progressService';
import 'vs/workbench/services/editor/browser/codeEditorService';
import 'vs/workbench/services/preferences/browser/preferencesService';
import 'vs/workbench/services/configuration/common/jsonEditingService';
import 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import 'vs/workbench/services/editor/browser/editorService';
import 'vs/workbench/services/history/browser/history';
import 'vs/workbench/services/activity/browser/activityService';
import 'vs/workbench/services/keybinding/browser/keybindingService';
import 'vs/workbench/services/untitled/common/untitledTextEditorService';
import 'vs/workbench/services/textresourceProperties/common/textResourcePropertiesService';
import 'vs/workbench/services/mode/common/workbenchModeService';
import 'vs/workbench/services/commands/common/commandService';
import 'vs/workbench/services/themes/browser/workbenchThemeService';
import 'vs/workbench/services/label/common/labelService';
import 'vs/workbench/services/extensionManagement/common/extensionEnablementService';
import 'vs/workbench/services/notification/common/notificationService';
import 'vs/workbench/services/extensions/common/staticExtensions';
import 'vs/workbench/services/userDataSync/common/userDataSyncUtil';
import 'vs/workbench/services/path/common/remotePathService';
import 'vs/workbench/services/remote/common/remoteExplorerService';
import 'vs/workbench/services/workingCopy/common/workingCopyService';
import 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import 'vs/workbench/services/views/browser/viewDescriptorService';

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { GlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { IExtensionGalleryService, IGlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsServiceImpl';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationService';
import { TextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfigurationServiceImpl';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';

registerSingleton(IGlobalExtensionEnablementService, GlobalExtensionEnablementService);
registerSingleton(IExtensionGalleryService, ExtensionGalleryService, true);
registerSingleton(IContextViewService, ContextViewService, true);
registerSingleton(IListService, ListService, true);
registerSingleton(IEditorWorkerService, EditorWorkerServiceImpl);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService);
registerSingleton(IMarkerService, MarkerService, true);
registerSingleton(IContextKeyService, ContextKeyService);
registerSingleton(IModelService, ModelServiceImpl, true);
registerSingleton(ITextResourceConfigurationService, TextResourceConfigurationService);
registerSingleton(IMenuService, MenuService, true);
registerSingleton(IDownloadService, DownloadService, true);
registerSingleton(IOpenerService, OpenerService, true);

//#endregion

//#region -- sql services

import { IConnectionManagementService } from 'sql/platform/connection/common/connectionManagement';
import { ConnectionManagementService } from 'sql/workbench/services/connection/browser/connectionManagementService';
import { IConnectionDialogService } from 'sql/workbench/services/connection/common/connectionDialogService';
import { ConnectionDialogService } from 'sql/workbench/services/connection/browser/connectionDialogService';
import { IErrorMessageService } from 'sql/platform/errorMessage/common/errorMessageService';
import { ErrorMessageService } from 'sql/workbench/services/errorMessage/browser/errorMessageService';
import { ServerGroupController } from 'sql/workbench/services/serverGroup/browser/serverGroupController';
import { IServerGroupController } from 'sql/platform/serverGroup/common/serverGroupController';
import { ICapabilitiesService } from 'sql/platform/capabilities/common/capabilitiesService';
import { CapabilitiesService } from 'sql/workbench/services/capabilities/common/capabilitiesServiceImpl';
import { ICredentialsService as sqlICredentialsService, CredentialsService } from 'sql/platform/credentials/common/credentialsService';
import { IQueryModelService } from 'sql/platform/query/common/queryModel';
import { QueryModelService } from 'sql/platform/query/common/queryModelService';
import { IQueryEditorService } from 'sql/workbench/services/queryEditor/common/queryEditorService';
import { QueryEditorService } from 'sql/workbench/services/queryEditor/browser/queryEditorService';
import { IQueryManagementService, QueryManagementService } from 'sql/platform/query/common/queryManagement';
import { IResourceProviderService } from 'sql/workbench/services/resourceProvider/common/resourceProviderService';
import { ResourceProviderService } from 'sql/workbench/services/resourceProvider/browser/resourceProviderService';
import { IAdsTelemetryService } from 'sql/platform/telemetry/common/telemetry';
import { AdsTelemetryService } from 'sql/platform/telemetry/common/adsTelemetryService';
import { OEShimService, IOEShimService } from 'sql/workbench/contrib/objectExplorer/browser/objectExplorerViewTreeShim';
import { IObjectExplorerService, ObjectExplorerService } from 'sql/workbench/services/objectExplorer/browser/objectExplorerService';
import { IAngularEventingService } from 'sql/platform/angularEventing/browser/angularEventingService';
import { AngularEventingService } from 'sql/platform/angularEventing/browser/angularEventingServiceImpl';
import { ISerializationService, SerializationService } from 'sql/platform/serialization/common/serializationService';
import { IMetadataService, MetadataService } from 'sql/platform/metadata/common/metadataService';
import { ITaskService, TaskService } from 'sql/platform/tasks/common/tasksService';
import { IEditorDescriptorService, EditorDescriptorService } from 'sql/workbench/services/queryEditor/browser/editorDescriptorService';
import { IAdminService, AdminService } from 'sql/workbench/services/admin/common/adminService';
import { IJobManagementService } from 'sql/platform/jobManagement/common/interfaces';
import { JobManagementService } from 'sql/platform/jobManagement/common/jobManagementService';
import { IBackupService } from 'sql/platform/backup/common/backupService';
import { BackupService } from 'sql/platform/backup/common/backupServiceImp';
import { IBackupUiService } from 'sql/workbench/services/backup/common/backupUiService';
import { BackupUiService } from 'sql/workbench/services/backup/browser/backupUiService';
import { IRestoreDialogController, IRestoreService } from 'sql/platform/restore/common/restoreService';
import { RestoreService, RestoreDialogController } from 'sql/platform/restore/browser/restoreServiceImpl';
import { INewDashboardTabDialogService } from 'sql/workbench/services/dashboard/browser/newDashboardTabDialog';
import { NewDashboardTabDialogService } from 'sql/workbench/services/dashboard/browser/newDashboardTabDialogService';
import { IFileBrowserService } from 'sql/platform/fileBrowser/common/interfaces';
import { FileBrowserService } from 'sql/platform/fileBrowser/common/fileBrowserService';
import { IFileBrowserDialogController } from 'sql/workbench/services/fileBrowser/common/fileBrowserDialogController';
import { FileBrowserDialogController } from 'sql/workbench/services/fileBrowser/browser/fileBrowserDialogController';
import { IInsightsDialogService } from 'sql/workbench/services/insights/browser/insightsDialogService';
import { InsightsDialogService } from 'sql/workbench/services/insights/browser/insightsDialogServiceImpl';
import { IAccountManagementService } from 'sql/platform/accounts/common/interfaces';
import { AccountManagementService } from 'sql/workbench/services/accountManagement/browser/accountManagementService';
import { IProfilerService } from 'sql/workbench/services/profiler/browser/interfaces';
import { ProfilerService } from 'sql/workbench/services/profiler/browser/profilerService';
import { AccountPickerService } from 'sql/workbench/contrib/accounts/browser/accountPickerService';
import { IAccountPickerService } from 'sql/workbench/contrib/accounts/browser/accountPicker';
import { IDashboardViewService } from 'sql/platform/dashboard/browser/dashboardViewService';
import { DashboardViewService } from 'sql/platform/dashboard/browser/dashboardViewServiceImpl';
import { IModelViewService } from 'sql/platform/modelComponents/browser/modelViewService';
import { ModelViewService } from 'sql/platform/modelComponents/browser/modelViewServiceImpl';
import { IDashboardService } from 'sql/platform/dashboard/browser/dashboardService';
import { DashboardService } from 'sql/platform/dashboard/browser/dashboardServiceImpl';
import { NotebookService } from 'sql/workbench/services/notebook/browser/notebookServiceImpl';
import { INotebookService } from 'sql/workbench/services/notebook/browser/notebookService';
import { IScriptingService, ScriptingService } from 'sql/platform/scripting/common/scriptingService';

registerSingleton(IDashboardService, DashboardService);
registerSingleton(IDashboardViewService, DashboardViewService);
registerSingleton(IModelViewService, ModelViewService);
registerSingleton(IAngularEventingService, AngularEventingService);
registerSingleton(INewDashboardTabDialogService, NewDashboardTabDialogService);
registerSingleton(IAccountManagementService, AccountManagementService);
registerSingleton(ISerializationService, SerializationService);
registerSingleton(IEditorDescriptorService, EditorDescriptorService);
registerSingleton(ITaskService, TaskService);
registerSingleton(IMetadataService, MetadataService);
registerSingleton(IAdminService, AdminService);
registerSingleton(IJobManagementService, JobManagementService);
registerSingleton(IBackupService, BackupService);
registerSingleton(IBackupUiService, BackupUiService);
registerSingleton(IScriptingService, ScriptingService);
registerSingleton(IRestoreService, RestoreService);
registerSingleton(IRestoreDialogController, RestoreDialogController);
registerSingleton(IFileBrowserService, FileBrowserService);
registerSingleton(IFileBrowserDialogController, FileBrowserDialogController);
registerSingleton(IInsightsDialogService, InsightsDialogService);
registerSingleton(INotebookService, NotebookService);
registerSingleton(IAccountPickerService, AccountPickerService);
registerSingleton(IProfilerService, ProfilerService);
registerSingleton(IConnectionManagementService, ConnectionManagementService as any);
registerSingleton(ICapabilitiesService, CapabilitiesService);
registerSingleton(IErrorMessageService, ErrorMessageService);
registerSingleton(IConnectionDialogService, ConnectionDialogService);
registerSingleton(IServerGroupController, ServerGroupController);
registerSingleton(sqlICredentialsService, CredentialsService);
registerSingleton(IResourceProviderService, ResourceProviderService);
registerSingleton(IQueryManagementService, QueryManagementService);
registerSingleton(IQueryModelService, QueryModelService);
registerSingleton(IQueryEditorService, QueryEditorService);
registerSingleton(IAdsTelemetryService, AdsTelemetryService);
registerSingleton(IObjectExplorerService, ObjectExplorerService);
registerSingleton(IOEShimService, OEShimService);

//#endregion


//#region --- workbench contributions

// Telemetry
import 'vs/workbench/contrib/telemetry/browser/telemetry.contribution';

// Preferences
import 'vs/workbench/contrib/preferences/browser/preferences.contribution';
import 'vs/workbench/contrib/preferences/browser/keybindingsEditorContribution';
import 'vs/workbench/contrib/preferences/browser/preferencesSearch';

// Logs
import 'vs/workbench/contrib/logs/common/logs.contribution';

// Quick Open Handlers
import 'vs/workbench/contrib/quickopen/browser/quickopen.contribution';

// Explorer
import 'vs/workbench/contrib/files/browser/explorerViewlet';
import 'vs/workbench/contrib/files/browser/fileActions.contribution';
import 'vs/workbench/contrib/files/browser/files.contribution';

// Backup
import 'vs/workbench/contrib/backup/common/backup.contribution';

// bulkEdit
import 'vs/workbench/contrib/bulkEdit/browser/bulkEdit.contribution';

// Search
import 'vs/workbench/contrib/search/browser/search.contribution';
import 'vs/workbench/contrib/search/browser/searchView';
import 'vs/workbench/contrib/search/browser/openAnythingHandler';

// SCM
import 'vs/workbench/contrib/scm/browser/scm.contribution';
import 'vs/workbench/contrib/scm/browser/scmViewlet';

/* {{SQL CARBON EDIT}} // Debug
import 'vs/workbench/contrib/debug/browser/debug.contribution';
import 'vs/workbench/contrib/debug/browser/debugQuickOpen';
import 'vs/workbench/contrib/debug/browser/debugEditorContribution';
import 'vs/workbench/contrib/debug/browser/breakpointEditorContribution';
import 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import 'vs/workbench/contrib/debug/browser/repl';
import 'vs/workbench/contrib/debug/browser/debugViewlet';
*/

// Markers
import 'vs/workbench/contrib/markers/browser/markers.contribution';

// Comments
import 'vs/workbench/contrib/comments/browser/comments.contribution';

// URL Support
import 'vs/workbench/contrib/url/common/url.contribution';

// Webview
import 'vs/workbench/contrib/webview/browser/webview.contribution';
import 'vs/workbench/contrib/customEditor/browser/webviewEditor.contribution';

// Extensions Management
import 'vs/workbench/contrib/extensions/browser/extensions.contribution';
import 'vs/workbench/contrib/extensions/browser/extensionsQuickOpen';
import 'vs/workbench/contrib/extensions/browser/extensionsViewlet';

// Output Panel
import 'vs/workbench/contrib/output/browser/output.contribution';
import 'vs/workbench/contrib/output/browser/outputPanel';

// Terminal
import 'vs/workbench/contrib/terminal/browser/terminal.contribution';
import 'vs/workbench/contrib/terminal/browser/terminalQuickOpen';
import 'vs/workbench/contrib/terminal/browser/terminalPanel';

// Relauncher
import 'vs/workbench/contrib/relauncher/browser/relauncher.contribution';

// Tasks
// import 'vs/workbench/contrib/tasks/browser/task.contribution'; {{SQL CARBON EDIT}}

// Remote
import 'vs/workbench/contrib/remote/common/remote.contribution';
import 'vs/workbench/contrib/remote/browser/remote';

// Emmet
// import 'vs/workbench/contrib/emmet/browser/emmet.contribution'; {{SQL CARBON EDIT}}

// CodeEditor Contributions
import 'vs/workbench/contrib/codeEditor/browser/codeEditor.contribution';

// Execution
import 'vs/workbench/contrib/externalTerminal/browser/externalTerminal.contribution';

// Snippets
import 'vs/workbench/contrib/snippets/browser/snippets.contribution';
import 'vs/workbench/contrib/snippets/browser/snippetsService';
import 'vs/workbench/contrib/snippets/browser/insertSnippet';
import 'vs/workbench/contrib/snippets/browser/configureSnippets';
import 'vs/workbench/contrib/snippets/browser/tabCompletion';

// Formatter Help
import 'vs/workbench/contrib/format/browser/format.contribution';

// Themes
import 'vs/workbench/contrib/themes/browser/themes.contribution';

// Update
import 'vs/workbench/contrib/update/browser/update.contribution';

// Watermark
import 'vs/workbench/contrib/watermark/browser/watermark';

// Surveys
import 'vs/workbench/contrib/surveys/browser/nps.contribution';
import 'vs/workbench/contrib/surveys/browser/languageSurveys.contribution';

// Welcome
import 'vs/workbench/contrib/welcome/overlay/browser/welcomeOverlay';
import 'vs/workbench/contrib/welcome/page/browser/welcomePage.contribution';
import 'vs/workbench/contrib/welcome/walkThrough/browser/walkThrough.contribution';

// Call Hierarchy
import 'vs/workbench/contrib/callHierarchy/browser/callHierarchy.contribution';

// Outline
import 'vs/workbench/contrib/outline/browser/outline.contribution';

// Experiments
import 'vs/workbench/contrib/experiments/browser/experiments.contribution';

// Send a Smile
import 'vs/workbench/contrib/feedback/browser/feedback.contribution';

// User Data Sync
import 'vs/workbench/contrib/userDataSync/browser/userDataSync.contribution';

// Code Actions
import 'vs/workbench/contrib/codeActions/common/codeActions.contribution';

//#endregion

//#region -- contributions

// query
import 'sql/workbench/contrib/query/browser/query.contribution';
import 'sql/workbench/contrib/query/common/resultsGrid.contribution';

// data explorer
import 'sql/workbench/contrib/dataExplorer/browser/dataExplorer.contribution';
import 'sql/workbench/contrib/dataExplorer/browser/nodeActions.common.contribution';

// {{SQL CARBON EDIT}}
//editor replacement
import 'sql/workbench/common/editorReplacer.contribution';

// tasks
import 'sql/workbench/contrib/tasks/browser/tasks.contribution';
import 'sql/workbench/browser/actions.contribution';

// telemetry
import 'sql/workbench/contrib/telemetry/common/telemetry.contribution';

// connection
import 'sql/workbench/contrib/connection/browser/connection.contribution';
import 'sql/workbench/contrib/objectExplorer/common/serverGroup.contribution';

// edit data editor
import 'sql/workbench/contrib/editData/browser/editData.contribution';

// query plan editor
import 'sql/workbench/contrib/queryPlan/browser/queryPlan.contribution';

//acounts
import 'sql/workbench/contrib/accounts/browser/accounts.contribution';
import 'sql/workbench/contrib/accounts/browser/accountManagement.contribution';

// profiler
import 'sql/workbench/contrib/profiler/browser/profiler.contribution';
import 'sql/workbench/contrib/profiler/browser/profilerActions.contribution';

// dashboard
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/barChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/doughnutChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/horizontalBarChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/lineChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/pieChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/scatterChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/charts/types/timeSeriesChart.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/countInsight.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/imageInsight.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/views/tableInsight.contribution';
import 'sql/workbench/contrib/dashboard/browser/dashboard.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/insights/insightsWidget.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/explorer/explorerWidget.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/tasks/tasksWidget.contribution';
import 'sql/workbench/contrib/dashboard/browser/widgets/webview/webviewWidget.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardWebviewContainer.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardControlHostContainer.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardGridContainer.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardWidgetContainer.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardContainer.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardNavSection.contribution';
import 'sql/workbench/contrib/dashboard/browser/containers/dashboardModelViewContainer.contribution';
import 'sql/workbench/contrib/dashboard/browser/core/dashboardTab.contribution';

// Model-based Views
import 'sql/workbench/browser/modelComponents/components.contribution';
import 'sql/workbench/browser/modelComponents/modelViewEditor.contribution';

// notebooks
import 'sql/workbench/contrib/notebook/browser/notebook.contribution';

// backup
import 'sql/workbench/contrib/backup/browser/backup.contribution';

//restore
import 'sql/workbench/contrib/restore/browser/restore.contribution';

// Scripting
import 'sql/workbench/contrib/scripting/browser/scripting.contribution';

//#endregion
