import * as path from "path";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient";

import { Config } from "server";
import { AutomateExtensionSettings } from "./settings";

let clients: Map<string, LanguageClient> = new Map();
let serverModule: string;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // The server is implemented in node
    serverModule = context.asAbsolutePath(path.join("server", "out", "src", "server.js"));

    function didAddedWorkspaceFolder(folder: vscode.WorkspaceFolder) {
        // If we have nested workspace folders we only start a server on the outer most workspace folder.
        folder = getOuterMostWorkspaceFolder(folder);
        if (!clients.has(folder.uri.toString())) {
            newWorkspaceFolderAdded(folder);
        }
    }

    if (vscode.workspace.workspaceFolders) {
        for (let folder of vscode.workspace.workspaceFolders) {
            didAddedWorkspaceFolder(folder);
        }
    }
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (let folder of event.removed) {
            let client = clients.get(folder.uri.toString());
            if (client) {
                clients.delete(folder.uri.toString());
                client.stop();
            }
        }
        for (let folder of event.added) {
            didAddedWorkspaceFolder(folder);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {}

function sortedWorkspaceFolders(): string[] {
    return vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.map(folder => {
        let result = folder.uri.toString();
        if (result.charAt(result.length - 1) !== '/') {
            result = result + '/';
        }
        return result;
    }).sort(
        (a, b) => {
            return a.length - b.length;
        }
    ) : [];
}

function getOuterMostWorkspaceFolder(folder: vscode.WorkspaceFolder): vscode.WorkspaceFolder {
    let sorted = sortedWorkspaceFolders();
    for (let element of sorted) {
        let uri = folder.uri.toString();
        if (uri.charAt(uri.length - 1) !== '/') {
            uri = uri + '/';
        }
        if (uri.startsWith(element)) {
            return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(element))!;
        }
    }
    return folder;
}

async function newWorkspaceFolderAdded(folder: vscode.WorkspaceFolder): Promise<void> {
    const automateSettings = new AutomateExtensionSettings(folder);

    if (automateSettings.useRTextServer) {
        // The debug options for the server
        // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
        const debugOptions = { execArgv: ["--nolazy", `--inspect-brk=${6009 + clients.size}`] };

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        const serverOptions: ServerOptions = {
            debug: {
                module: serverModule,
                options: debugOptions,
                transport: TransportKind.ipc,
            },
            run: { module: serverModule, transport: TransportKind.ipc },
        };

        let config = Config.find_service_config();

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for bake project files
            documentSelector: [{ scheme: "file", language: "automate", pattern: `${folder.uri.fsPath}/**/*.atm` }],
            synchronize: {
                // Notify the server about file changes contained in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher("**/*.atm"),
            },
            initializationOptions: {
                command: 'automate-rtext-service',
                args: [path.join(folder.uri.fsPath, '**')],
                hoverProvider: true
            },
            workspaceFolder: folder
        };

        // Create the language client and start the client.
        let client = new LanguageClient(
            "automateServer",
            "Automate Language Server",
            serverOptions,
            clientOptions,
        );

        // Start the client. This will also launch the server
        client.start();
        clients.set(folder.uri.toString(), client);
    }
}