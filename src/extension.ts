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

import { ServiceConfig } from "./server/src/rtext/config";
import { ConnectorManager, ConnectorInterface } from "./server/src/rtext/connectorManager";
import { AutomateExtensionSettings } from "./settings";

let serverModule: string;

class LspConnector implements ConnectorInterface {
    private _client: LanguageClient;
    static debugPort: number = 6011;

    constructor(config: ServiceConfig, data?: any) {
        // The debug options for the server
        // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
        const debugOptions = LspConnector.debugPort > 6012 ?
            { execArgv: ["--nolazy"] } : { execArgv: ["--nolazy", `--inspect-brk=${LspConnector.debugPort}`] };
        LspConnector.debugPort++;

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

        let configPath = path.dirname(config.file);
        let pattern = `${configPath}/**/{${config.patterns.join('|')}}`;
        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for bake project files
            documentSelector: [{ scheme: "file", language: "atm", pattern: pattern }],
            synchronize: {
                // Notify the server about file changes contained in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher(`${configPath}/**/*.atm`),
            },
            initializationOptions: {
                hoverProvider: false,  // does not supported by RText
                rtextConfig: config
            },
            workspaceFolder: data.workspaceFolder
        };

        // Create the language client and start the client.
        this._client = new LanguageClient(
            "automateServer",
            "Automate Language Server",
            serverOptions,
            clientOptions,
        );

        // Start the client. This will also launch the server
        this._client.start();
    }

    public stop(): void {
        this._client.stop();
    }
}

let connectorManager: ConnectorManager = new ConnectorManager(LspConnector);

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // The server is implemented in node
    serverModule = context.asAbsolutePath(path.join("out", "server", "src", "server.js"));

    vscode.workspace.textDocuments.forEach((document) => {
        if (document.languageId == 'atm' && !document.isClosed) {
            newTextDocumentOpened(document);
        }
    })
    vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId == 'atm') {
            newTextDocumentOpened(document);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
    connectorManager.allConnectors().forEach(con => con.stop());
}

async function newTextDocumentOpened(document: vscode.TextDocument): Promise<void> {
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
        const automateSettings = new AutomateExtensionSettings(workspaceFolder);
        if (automateSettings.useRTextServer) {
            connectorManager.connectorForFile(document.uri.fsPath, { workspaceFolder });
        }
    }
}