import * as path from 'path';
import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

import { ServiceConfig } from '../modules/rtext-lsp-adapter/src/rtext/config';
import { ConnectorManager, ConnectorInterface } from '../modules/rtext-lsp-adapter/src/rtext/connectorManager';

let serverModule: string;
let statusBar: vscode.StatusBarItem;

class LspConnector implements ConnectorInterface {
    public client: LanguageClient;
    static debugPort = 6011;
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

        const configPath = path.dirname(config.file);
        const pattern = `${configPath}/**/{${config.patterns.join('|')}}`;
        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for project files
            documentSelector: [{ scheme: "file", pattern: pattern }],
            synchronize: {
                // Notify the server about file changes contained in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher(pattern),
            },
            initializationOptions: {
                hoverProvider: false,  // FIXME: does not supported by RText
                rtextConfig: config
            },
            workspaceFolder: data.workspaceFolder,
            progressOnInitialization: true
        };

        // Create the language client and start the client.
        this.client = new LanguageClient(
            "automateServer",
            "Automate Language Server",
            serverOptions,
            clientOptions,
        );

        // Start the client. This will also launch the server
        this.client.start();
    }

    public stop(): void {
        this.client.stop();
    }
}

const connectorManager: ConnectorManager = new ConnectorManager(LspConnector);

async function newTextDocumentOpened(document: vscode.TextDocument): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const useRTextServer = vscode.workspace.getConfiguration("automate", workspaceFolder).get<boolean>('useRTextServer');
    if (workspaceFolder && useRTextServer) {
        const connector = connectorManager.connectorForFile(document.uri.fsPath, { workspaceFolder });
        if (!connector && document.languageId === 'atm') {
            const message = `Cannot find .rtext configuration associated with the file: ${document.uri.fsPath}`;
            vscode.window.showWarningMessage(message);
        }
        else {
            const connectors = connectorManager.allConnectors();
            statusBar.text = `ESR Automate $(vm) ${connectors.length}`;
        }
    }
}

interface ConnectorQuickPickItem extends vscode.QuickPickItem {
    connector: LspConnector;
}

// shows a list of all open connectors
export async function showConnectors(): Promise<void> {
    const connectors = connectorManager.allConnectors() as LspConnector[];
    const items: ConnectorQuickPickItem[] = connectors.map((conn: LspConnector) => {
        const icon = conn.client.needsStop() ? '$(vm-active)' : '$(vm-outline)';
        const workspaceFolder = conn.client.clientOptions.workspaceFolder;
        const name = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, conn.config.file) : conn.config.file;
        return {
            label: icon + ' ' + name,
            detail: conn.config.patterns + ': ' + conn.config.command,
            buttons: [{ iconPath: new vscode.ThemeIcon('debug-restart') }],
            connector: conn
        };
    });

    const current = vscode.window.createQuickPick<ConnectorQuickPickItem>();
    current.items = items;
    current.placeholder = 'Select .rtext configuration file to open'
    current.onDidChangeSelection(async (selectedItems) => {
        if (selectedItems && selectedItems.length > 0) {
            const filename = selectedItems[0].connector.config.file;
            const document = await vscode.workspace.openTextDocument(filename);
            await vscode.window.showTextDocument(document);
        }
    });
    current.onDidTriggerItemButton(async (event) => {
        const connector = event.item.connector;
        if (connector.client.needsStop()) {
            connector.client.stop().then(() => {
                connector.client.start();
            });
        }
        else {
            connector.client.start();
        }
    });
    current.show();
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
    // The server is implemented in node
    serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

    context.subscriptions.push(vscode.commands.registerCommand('automate.showConnectors', showConnectors));

    statusBar = vscode.window.createStatusBarItem();
    statusBar.text = 'ESR Automate $(vm) 0';
    statusBar.tooltip = 'View Running RText Services';
    statusBar.command = 'automate.showConnectors';
    statusBar.show();

    vscode.workspace.textDocuments.forEach((document) => {
        if (!document.isClosed) {
            newTextDocumentOpened(document);
        }
    });

    vscode.workspace.onDidOpenTextDocument((document) => {
        newTextDocumentOpened(document);
    });
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    connectorManager.allConnectors().forEach(con => con.stop());
    statusBar.dispose();
}
