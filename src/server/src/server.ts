import {
    createConnection,
    Diagnostic,
    DiagnosticSeverity,
    DocumentLink,
    DocumentLinkParams,
    ProposedFeatures,
    Range,
    SymbolInformation,
    TextDocuments,
    TextDocumentSyncKind,
    Hover,
    TextDocumentPositionParams,
    InsertTextFormat,
    CompletionParams,
    CompletionItem,
    CompletionItemKind,
    WorkspaceSymbolParams,
    SymbolKind
} from "vscode-languageserver";

import { TextDocument } from "vscode-languageserver-textdocument";

import { Client as RTextClient } from "./rtext/client";
import * as rtext from "./rtext/protocol";
import { Context } from "./rtext/context";
import { ServerInitializationOptions } from "./options";

// Creates the LSP connection
const connection = createConnection(ProposedFeatures.all);

// Create a manager for open text documents
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// The workspace folder this server is operating on
let workspaceFolder: string | null | undefined;

// Initialization options passed by the client
let settings: ServerInitializationOptions;

let rtextClient: RTextClient;

let previousProblemFiles: string[] = [];
function provideDiagnostics() {
    rtextClient.loadModel().then((data) => {
        const problemFiles: string[] = [];
        data.problems.forEach((problem) => {
            const diagnostics: Diagnostic[] = [];

            function convertSeverity(severity: rtext.ProblemSeverity): DiagnosticSeverity {
                switch (severity) {
                    case rtext.ProblemSeverity.debug:
                        return DiagnosticSeverity.Hint;
                    case rtext.ProblemSeverity.error:
                    case rtext.ProblemSeverity.fatal:
                        return DiagnosticSeverity.Error;
                    case rtext.ProblemSeverity.warn:
                        return DiagnosticSeverity.Warning;
                    case rtext.ProblemSeverity.info:
                        return DiagnosticSeverity.Information;
                    default:
                        //@todo assert
                        return DiagnosticSeverity.Error;
                }
            }

            problem.problems.forEach((fileProblem) => {
                const diagnostic: Diagnostic = {
                    message: fileProblem.message,
                    range: Range.create(fileProblem.line - 1, 0, fileProblem.line - 1, Number.MAX_SAFE_INTEGER),
                    severity: convertSeverity(fileProblem.severity),
                };

                diagnostics.push(diagnostic);
            });
            connection.sendDiagnostics({ uri: problem.file, diagnostics });
            problemFiles.push(problem.file);
        });

        previousProblemFiles.forEach((file) => {
            if (!problemFiles.includes(file)) {
                connection.sendDiagnostics({ uri: file, diagnostics: [] });
            }
        });

        previousProblemFiles = problemFiles;
    }).catch(error => {
        console.log(`Failed to load model: ${error.message}`);
    });
}

function extractContext(document: TextDocument, position: any): Context {
    let text = document.getText(Range.create(0, 0, position.line, Number.MAX_SAFE_INTEGER));
    let lines = text.split('\n');
    lines.pop(); // remove last `\n` added by getText
    let pos = position.character + 1; // column number start at 1 in RText protocol
    return Context.extract(lines, pos);
}

connection.onHover((params: TextDocumentPositionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const ctx = extractContext(document, params.position);
        return rtextClient.getContextInformation(ctx).then((response: rtext.ContextInformationResponse) => {
            return { contents: response.desc };
        });
    }
});

connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): Promise<SymbolInformation[]> | undefined => {
    return rtextClient.findElements(params.query).then((response: rtext.FindElementsResponse) => {
        let info: SymbolInformation[] = [];
        response.elements.forEach((e) => {
            info.push({
                name: e.display,
                location: {
                    uri: e.file,
                    range: {
                        start: { line: e.line, character: 0 },
                        end: { line: e.line, character: Number.MAX_SAFE_INTEGER }
                    }
                },
                kind: SymbolKind.Null
            });
        });
        return info;
    });
});

connection.onDocumentLinks((params: DocumentLinkParams): DocumentLink[] => {
    const document = documents.get(params.textDocument.uri);
    let links: DocumentLink[] = [];
    if (document) {
        const lines: string[] = document.getText().split('\n');
        const re = /\/+[\/\w]+/g;
        lines.forEach((line: string, index: number) => {
            let m;
            do {
                m = re.exec(line);
                if (m) {
                    let range = Range.create(
                        { line: index, character: m.index },
                        { line: index, character: m.index + m[0].length }
                    );
                    let data = { textDocument: params.textDocument };
                    links.push({ range, data });
                }
            } while (m)
        });
    }
    return links;
});

connection.onDocumentLinkResolve((link: DocumentLink): Promise<DocumentLink> | undefined => {
    const document = documents.get(link.data.textDocument.uri);
    if (document) {
        const ctx = extractContext(document, link.range.start);
        return rtextClient.getLinkTargets(ctx).then((response: rtext.LinkTargetsResponse) => {
            if (response.targets.length > 0) {
                link.target = `${response.targets[0].file}#${response.targets[0].line}`;
            }
            return link;
        });
    }
});

connection.onCompletion((params: CompletionParams): Promise<CompletionItem[]> | undefined => {
    function createSnippetString(insert: string): string {
        let begin = 0;
        let snippet: string = "";
        while (begin != -1) {
            let pos = begin;
            begin = insert.indexOf('|', begin);
            if (pos != begin) {
                const text = insert.substring(pos, begin === -1 ? insert.length : begin);
                snippet = snippet.concat(text);
            }
            if (begin != -1) {
                let end = insert.indexOf('|', begin);
                let number = parseInt(insert.substring(begin, end));

                begin = end;
                end = insert.indexOf('|', begin);
                let name = insert.substring(begin, end);

                begin = end;
                end = insert.indexOf('|', begin);
                let description = insert.substring(begin, end);

                begin = end;
                snippet = snippet.concat(`\$\{${number}:${name}\}`);
            }
        }
        return snippet;
    }
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const ctx = extractContext(document, params.position);
        return rtextClient.getContentCompletion(ctx).then((response: rtext.ContentCompleteResponse) => {
            const items: CompletionItem[] = [];
            response.options.forEach((option) => {
                items.push({
                    insertText: createSnippetString(option.insert),
                    insertTextFormat: InsertTextFormat.Snippet,
                    label: option.display,
                    detail: option.desc,
                    kind: CompletionItemKind.Snippet
                });
            });
            return items;
        });
    }
});

connection.onInitialize((params) => {
    workspaceFolder = params.rootPath;
    connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Started and initialize received`);

    settings = params.initializationOptions;
    rtextClient = new RTextClient(settings.rtextConfig);

    return {
        capabilities: {
            textDocumentSync: {
                change: TextDocumentSyncKind.Full,
                openClose: true,
            },
            completionProvider: {
                resolveProvider: false
            },
            documentLinkProvider: {
                resolveProvider: true
            },
            hoverProvider: settings.hoverProvider,
            workspaceSymbolProvider: true
        },
    };
});

connection.onInitialized(async () => {
    connection.console.log(`[Server(${process.pid}) ${workspaceFolder}] Initialized received`);
    if (workspaceFolder) {
        rtextClient.start().then(() => {
            provideDiagnostics();
        });
    }
});

connection.onDidChangeWatchedFiles((params) => {
    provideDiagnostics();
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

connection.onShutdown(() => {
    rtextClient.stop();
});
