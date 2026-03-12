import * as path from 'path';
import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient/node';

import * as rtext from '../modules/rtext-lsp-adapter/src/rtext';

let serverModule: string;
let statusBar: vscode.StatusBarItem;

type ConnectorData = { workspaceFolder: vscode.WorkspaceFolder };

class LspConnector implements rtext.ConnectorInterface {
    public client: lsp.LanguageClient;
    public id: number
    static debugPort = 6011;
    static nextId = 1;
    readonly config: rtext.ServiceConfig;

    constructor(config: rtext.ServiceConfig, data?: ConnectorData) {
        this.config = config;
        this.id = LspConnector.nextId++;

        // The debug options for the server
        // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
        const debugOptions = LspConnector.debugPort > 6011 ?
            { execArgv: ["--nolazy"] } : { execArgv: ["--nolazy", `--inspect-brk=${LspConnector.debugPort}`] };
        LspConnector.debugPort++;

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        const serverOptions: lsp.ServerOptions = {
            debug: {
                module: serverModule,
                options: debugOptions,
                transport: lsp.TransportKind.ipc,
            },
            run: { module: serverModule, transport: lsp.TransportKind.ipc },
        };

        const configDir = path.dirname(config.file);
        const patternGlob = `{${config.patterns.join('|')}}`;
        // Resolve each path from the rtext command relative to the .rtext file's directory.
        // Fall back to the config directory itself if no paths were found.
        const searchRoots = config.paths.length > 0
            ? config.paths.map(p => path.resolve(configDir, p))
            : [configDir];
        const patterns = searchRoots.map(root => `${root}/**/${patternGlob}`);

        // Options to control the language client
        const clientOptions: lsp.LanguageClientOptions = {
            // Register the server for project files
            documentSelector: patterns.map(p => ({ scheme: "file", pattern: p })),
            synchronize: {
                // Notify the server about file changes contained in the workspace
                fileEvents: patterns.map(p => vscode.workspace.createFileSystemWatcher(p)),
            },
            initializationOptions: {
                hoverProvider: false,  // FIXME: does not supported by RText
                rtextConfig: config,
                id: this.id
            },
            workspaceFolder: data?.workspaceFolder,
            progressOnInitialization: true
        };

        // Create the language client and start the client.
        this.client = new lsp.LanguageClient(
            `automate-rtext-service`,
            `Automate Language Server ${this.id}`,
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

const connectorManager: rtext.ConnectorManager<ConnectorData> = new rtext.ConnectorManager<ConnectorData>(LspConnector);

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

    const buildItems = (): ConnectorQuickPickItem[] => connectors.map((conn: LspConnector) => {
        const isRunning = conn.client.needsStop();
        const icon = isRunning ? '$(vm-active)' : '$(vm-outline)';
        const workspaceFolder = conn.client.clientOptions.workspaceFolder;
        const name = workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, conn.config.file) : conn.config.file;
        const pauseResumeButton = isRunning
            ? { iconPath: new vscode.ThemeIcon('debug-pause'), tooltip: 'Pause' }
            : { iconPath: new vscode.ThemeIcon('debug-start'), tooltip: 'Resume' };
        return {
            label: icon + ` [${conn.id}] ` + name,
            detail: conn.config.patterns + ': ' + conn.config.command,
            buttons: [
                { iconPath: new vscode.ThemeIcon('debug-restart'), tooltip: 'Restart' },
                pauseResumeButton
            ],
            connector: conn
        };
    });

    const current = vscode.window.createQuickPick<ConnectorQuickPickItem>();
    current.items = buildItems();
    current.placeholder = 'Select .rtext configuration file to open'
    current.onDidChangeSelection(async (selectedItems) => {
        if (selectedItems && selectedItems.length > 0) {
            const filename = selectedItems[0].connector.config.file;
            const document = await vscode.workspace.openTextDocument(filename);
            await vscode.window.showTextDocument(document);
        }
    });
    const busy = new Set<LspConnector>();
    current.onDidTriggerItemButton(async (event) => {
        const connector = event.item.connector;
        if (busy.has(connector)) { return; }
        busy.add(connector);
        try {
            if (event.button.tooltip === 'Restart') {
                if (connector.client.needsStop()) {
                    await connector.client.stop();
                }
                connector.client.start();
            } else {
                // Pause / Resume
                if (connector.client.needsStop()) {
                    await connector.client.stop();
                } else {
                    connector.client.start();
                }
            }
        } finally {
            busy.delete(connector);
            current.items = buildItems();
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
