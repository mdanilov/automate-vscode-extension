import * as vscode from "vscode";

export interface ExtensionSettings {
    useRTextServer: boolean;
}

export class AutomateExtensionSettings {
    private _configData: ExtensionSettings;

    constructor(folder: vscode.WorkspaceFolder) {
        this._configData = <ExtensionSettings><any>vscode.workspace.getConfiguration("automate", folder.uri);
    }

    get useRTextServer(): boolean { return this.configData.useRTextServer; }

    get configData(): ExtensionSettings { return this._configData; }
}

export default AutomateExtensionSettings;
