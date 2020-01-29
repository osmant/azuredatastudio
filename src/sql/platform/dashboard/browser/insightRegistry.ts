/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Type } from '@angular/core';

import * as platform from 'vs/platform/registry/common/platform';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import * as nls from 'vs/nls';
import { IInsightData } from 'sql/workbench/contrib/charts/browser/interfaces';
import { values } from 'vs/base/common/collections';

export type InsightIdentifier = string;

export const Extensions = {
	InsightContribution: 'dashboard.contributions.insights'
};

export interface IInsightsConfig {
	cacheId?: string;
	type: any;
	name?: string;
	when?: string;
	gridItemConfig?: ISize;
	query?: string | Array<string>;
	queryFile?: string;
	details?: IInsightsConfigDetails;
	autoRefreshInterval?: number;
	id?: string;
}

export interface IInsightsLabel {
	column: string;
	icon?: string;
	state?: Array<IStateCondition>;
}

export interface IStateCondition {
	condition: {
		if: string,
		equals?: string
	};
	color?: string;
	icon?: string;
}

export interface IInsightsConfigDetails {
	query?: string | Array<string>;
	queryFile?: string;
	label?: string | IInsightsLabel;
	value?: string;
	actions?: {
		types: Array<string>;
		database?: string;
		server?: string;
		user?: string;
	};
}

export interface ISize {
	x: number;
	y: number;
}

export interface IInsightsView {
	data: IInsightData;
	setConfig?: (config: { [key: string]: any }) => void;
	init?: () => void;
}

export interface IInsightRegistry {
	insightSchema: IJSONSchema;
	registerInsight(id: string, description: string, schema: IJSONSchema, ctor: Type<IInsightsView>): InsightIdentifier;
	registerExtensionInsight(id: string, val: IInsightsConfig): void;
	getRegisteredExtensionInsights(id: string): IInsightsConfig;
	getCtorFromId(id: string): Type<IInsightsView>;
	getAllCtors(): Array<Type<IInsightsView>>;
	getAllIds(): Array<string>;
}

class InsightRegistry implements IInsightRegistry {
	private _insightSchema: IJSONSchema = { type: 'object', description: nls.localize('schema.dashboardWidgets.InsightsRegistry', "Widget used in the dashboards"), properties: {}, additionalProperties: false };
	private _extensionInsights: { [x: string]: IInsightsConfig } = {};
	private _idToCtor: { [x: string]: Type<IInsightsView> } = {};

	/**
	 * Register a dashboard widget
	 * @param id id of the widget
	 * @param description description of the widget
	 * @param schema config schema of the widget
	 */
	public registerInsight(id: string, description: string, schema: IJSONSchema, ctor: Type<IInsightsView>): InsightIdentifier {
		this._insightSchema.properties![id] = schema;
		this._idToCtor[id] = ctor;
		return id;
	}

	public registerExtensionInsight(id: string, val: IInsightsConfig): void {
		this._extensionInsights[id] = val;
	}

	public getRegisteredExtensionInsights(id: string): IInsightsConfig {
		return this._extensionInsights[id];
	}

	public getCtorFromId(id: string): Type<IInsightsView> {
		return this._idToCtor[id];
	}

	public getAllCtors(): Array<Type<IInsightsView>> {
		return values(this._idToCtor);
	}

	public getAllIds(): Array<string> {
		return Object.keys(this._idToCtor);
	}

	public get insightSchema(): IJSONSchema {
		return this._insightSchema;
	}
}

const insightRegistry = new InsightRegistry();
platform.Registry.add(Extensions.InsightContribution, insightRegistry);

export function registerInsight(id: string, description: string, schema: IJSONSchema, ctor: Type<IInsightsView>): InsightIdentifier {
	return insightRegistry.registerInsight(id, description, schema, ctor);
}

const WidgetAutoRefreshState: { [key: string]: boolean } = {};

export function getWidgetAutoRefreshState(widgetId: string, connectionId: string): boolean {
	const key = widgetId + connectionId;
	return Object.keys(WidgetAutoRefreshState).indexOf(key) === -1 || WidgetAutoRefreshState[key];
}

export function setWidgetAutoRefreshState(widgetId: string, connectionId: string, state: boolean): void {
	WidgetAutoRefreshState[widgetId + connectionId] = state;
}
