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

import { Config } from "./server/src/rtext/config";
import { AutomateExtensionSettings } from "./settings";

let clients: Map<string, LanguageClient> = new Map();
let serverModule: string;

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
export function deactivate() {}

async function newTextDocumentOpened(document: vscode.TextDocument): Promise<void> {
    let folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const automateSettings = new AutomateExtensionSettings(folder);
    let config = Config.find_service_config(document.uri.fsPath);

    if (automateSettings.useRTextServer && folder && config && !clients.has(config.file)) {
        // The debug options for the server
        // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
        const debugOptions = { execArgv: ["--nolazy", `--inspect-brk=${6011 + clients.size}`] };

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
        clients.set(config.file, client);
    }
}