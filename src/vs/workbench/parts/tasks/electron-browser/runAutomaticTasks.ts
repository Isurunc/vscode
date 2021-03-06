/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITaskService, WorkspaceFolderTaskResult } from 'vs/workbench/parts/tasks/common/taskService';
import { forEach } from 'vs/base/common/collections';
import { RunOnOptions, Task, TaskRunSource } from 'vs/workbench/parts/tasks/common/tasks';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Action } from 'vs/base/common/actions';

const ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE = 'tasks.run.allowAutomatic';

export class RunAutomaticTasks extends Disposable implements IWorkbenchContribution {
	constructor(
		@ITaskService private readonly taskService: ITaskService,
		@IStorageService storageService: IStorageService) {
		super();
		const isFolderAutomaticAllowed = storageService.getBoolean(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, StorageScope.WORKSPACE, undefined);
		this.tryRunTasks(isFolderAutomaticAllowed);
	}

	private tryRunTasks(isAllowed: boolean | undefined) {
		// Only run if allowed. Prompting for permission occurs when a user first tries to run a task.
		if (isAllowed === true) {
			this.taskService.getWorkspaceTasks(TaskRunSource.FolderOpen).then(workspaceTaskResult => {
				let { tasks } = RunAutomaticTasks.findAutoTasks(this.taskService, workspaceTaskResult);
				if (tasks.length > 0) {
					RunAutomaticTasks.runTasks(this.taskService, tasks);
				}
			});
		}
	}

	private static runTasks(taskService: ITaskService, tasks: Array<Task | Promise<Task>>) {
		tasks.forEach(task => {
			if (task instanceof Promise) {
				task.then(promiseResult => {
					if (promiseResult) {
						taskService.run(promiseResult);
					}
				});
			} else {
				taskService.run(task);
			}
		});
	}

	private static findAutoTasks(taskService: ITaskService, workspaceTaskResult: Map<string, WorkspaceFolderTaskResult>): { tasks: Array<Task | Promise<Task>>, taskNames: Array<string> } {
		const tasks = new Array<Task | Promise<Task>>();
		const taskNames = new Array<string>();
		if (workspaceTaskResult) {
			workspaceTaskResult.forEach(resultElement => {
				if (resultElement.set) {
					resultElement.set.tasks.forEach(task => {
						if (task.runOptions.runOn === RunOnOptions.folderOpen) {
							tasks.push(task);
							taskNames.push(task._label);
						}
					});
				}
				if (resultElement.configurations) {
					forEach(resultElement.configurations.byIdentifier, (configedTask) => {
						if (configedTask.value.runOptions.runOn === RunOnOptions.folderOpen) {
							tasks.push(new Promise<Task>(resolve => {
								taskService.getTask(resultElement.workspaceFolder, configedTask.value._id, true).then(task => resolve(task));
							}));
							if (configedTask.value._label) {
								taskNames.push(configedTask.value._label);
							} else {
								taskNames.push(configedTask.value.configures.task);
							}
						}
					});
				}
			});
		}
		return { tasks, taskNames };
	}

	public static promptForPermission(taskService: ITaskService, storageService: IStorageService, notificationService: INotificationService,
		workspaceTaskResult: Map<string, WorkspaceFolderTaskResult>) {
		const isFolderAutomaticAllowed = storageService.getBoolean(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, StorageScope.WORKSPACE, undefined);
		if (isFolderAutomaticAllowed !== void 0) {
			return;
		}

		let { tasks, taskNames } = RunAutomaticTasks.findAutoTasks(taskService, workspaceTaskResult);
		if (taskNames.length > 0) {
			// We have automatic tasks, prompt to allow.
			this.showPrompt(notificationService, storageService, taskService, taskNames).then(allow => {
				if (allow) {
					RunAutomaticTasks.runTasks(taskService, tasks);
				}
			});
		}
	}

	private static showPrompt(notificationService: INotificationService, storageService: IStorageService, taskService: ITaskService,
		taskNames: Array<string>): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			notificationService.prompt(Severity.Info, nls.localize('tasks.run.allowAutomatic', "This folder has tasks ({0}) defined in \'tasks.json\' that run automatically when you open this folder. Do you allow automatic tasks to run when you open this folder?", taskNames.join(', ')),
				[{
					label: nls.localize('allow', "Allow and run"),
					run: () => {
						resolve(true);
						storageService.store(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, true, StorageScope.WORKSPACE);
					}
				},
				{
					label: nls.localize('disallow', "Disallow"),
					run: () => {
						resolve(false);
						storageService.store(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, false, StorageScope.WORKSPACE);
					}
				},
				{
					label: nls.localize('openTasks', "Open tasks.json"),
					run: () => {
						taskService.openConfig(undefined);
						resolve(false);
					}
				}]
			);
		});
	}

}

export class AllowAutomaticTaskRunning extends Action {

	public static readonly ID = 'workbench.action.tasks.allowAutomaticRunning';
	public static readonly LABEL = nls.localize('workbench.action.tasks.allowAutomaticRunning', "Allow Automatic Tasks in Folder");

	constructor(
		id: string, label: string,
		@IStorageService private storageService: IStorageService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		this.storageService.store(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, true, StorageScope.WORKSPACE);
		return Promise.resolve(void 0);
	}
}

export class DisallowAutomaticTaskRunning extends Action {

	public static readonly ID = 'workbench.action.tasks.disallowAutomaticRunning';
	public static readonly LABEL = nls.localize('workbench.action.tasks.disallowAutomaticRunning', "Disallow Automatic Tasks in Folder");

	constructor(
		id: string, label: string,
		@IStorageService private storageService: IStorageService
	) {
		super(id, label);
	}

	public run(event?: any): Promise<any> {
		this.storageService.store(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, false, StorageScope.WORKSPACE);
		return Promise.resolve(void 0);
	}
}
