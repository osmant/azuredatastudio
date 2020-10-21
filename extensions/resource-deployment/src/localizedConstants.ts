/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export const account = localize('azure.account', "Azure Account");
export const subscription = localize('azure.account.subscription', "Subscription");
export const resourceGroup = localize('azure.account.resourceGroup', "Resource Group");
export const location = localize('azure.account.location', "Azure Location");
export const browse = localize('filePicker.browse', "Browse");
export const select = localize('filePicker.select', "Select");
export const kubeConfigFilePath = localize('kubeConfigClusterPicker.kubeConfigFilePatht', "Kube config file path");
export const clusterContextNotFound = localize('kubeConfigClusterPicker.clusterContextNotFound', "No cluster context information found");
