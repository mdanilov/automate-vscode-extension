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

import { ServiceConfig } from "../modules/rtext-lsp-adapter/src/rtext/config";
import { ConnectorManager, ConnectorInterface } from "../modules/rtext-lsp-adapter/src/rtext/connectorManager";
import { AutomateExtensionSettings } from "./settings";

let serverModule: string;
let statusBar: vscode.StatusBarItem;

class LspConnector implements ConnectorInterface {
    private _client: LanguageClient;
    static debugPort: number = 6011;
    readonly config: ServiceConfig;

    constructor(config: ServiceConfig, data?: any) {
        this.config = config;

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
    serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

    context.subscriptions.push(vscode.commands.registerCommand('automate.showConnectors', showConnectors));

    statusBar = vscode.window.createStatusBarItem();
    statusBar.text = 'ESR Automate: Not running';
    statusBar.tooltip = 'Shows the number of running automate-rtext-service instances';
    statusBar.command = 'automate.showConnectors';
    statusBar.show();

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

// shows a list of all open connectors
export async function showConnectors() {
    const connectors = connectorManager.allConnectors();
    const items: vscode.QuickPickItem[] = connectors.map(conn => {
        return {
            label: conn.config.file,
            detail: conn.config.patterns + ': ' + conn.config.command
        };
    });
    vscode.window.showQuickPick(items, {
        placeHolder: 'Select .rtext configuration file to open'
    }).then(async (item) => {
        if (item) {
            const document = await vscode.workspace.openTextDocument(item.label);
            await vscode.window.showTextDocument(document);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {
    connectorManager.allConnectors().forEach(con => con.stop());
    statusBar.dispose();
}

async function newTextDocumentOpened(document: vscode.TextDocument): Promise<void> {
    let workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (workspaceFolder) {
        const automateSettings = new AutomateExtensionSettings(workspaceFolder);
        if (automateSettings.useRTextServer) {
            const connector = connectorManager.connectorForFile(document.uri.fsPath, { workspaceFolder });
            if (!connector) {
                const message = `Cannot find .rtext configuration associated with the file: ${document.uri.fsPath}`;
                vscode.window.showWarningMessage(message);
            }
            else {
                const connectors = connectorManager.allConnectors();
                statusBar.text = `ESR Automate: Running [${connectors.length}]`;
            }
        }
    }
}
