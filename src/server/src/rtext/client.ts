import * as net from "net";
import * as child_process from "child_process";
import * as path from "path";
import * as os from "os";
import { clearInterval } from "timers";

import * as rtextProtocol from "./protocol";
import { Context } from "./context";
import { Message } from "./message";
import { ServiceConfig } from "./config";

class PendingRequest {
    public invocationId: number = 0;
    public command: string = "";
    public progressCallback?: Function;
    public resolveFunc: Function = () => { };
}

interface RTextService {
    config: ServiceConfig;
    process?: child_process.ChildProcess;
    port?: number;
}

export class Client {

    private _client = new net.Socket();
    private _invocationCounter = 0;
    private _connected = false;
    private _pendingRequests: PendingRequest[] = [];
    private _reconnectTimeout?: NodeJS.Timeout;
    private _keepAliveTask?: NodeJS.Timeout;
    private _rtextService?: RTextService;
    private _responseData: Buffer = Buffer.alloc(0);

    public async start(config: ServiceConfig): Promise<any> {
        return this.runRTextService(config).then(service => {
            this._rtextService = service;
            service.process!.on('close', () => {
                this._rtextService = undefined;
            });

            this._client.on("data", (data) => this.onData(data));
            this._client.on("close", () => this.onClose());
            this._client.on("error", (error) => this.onError(error));
            this._client.connect(service.port!, "127.0.0.1", () => this.onConnect());

            this._keepAliveTask = setInterval(() => {
                this.getVersion().then((response) => { console.log("Keep alive, got version " + response.version); });
            }, 60 * 1000);
        }).catch(error => {
            console.log(`Failed to run service ${config.command}, reason: ${error.message}`);
        });
    }

    public getContextInformation(context: Context): Promise<rtextProtocol.ContextInformationResponse> {
        return this.send({ command: "context_info", context: context.lines, column: context.pos });
    }

    public getContentCompletion(context: Context): Promise<rtextProtocol.ContentCompleteResponse> {
        return this.send({ command: "content_complete", context: context.lines, column: context.pos });
    }

    public getLinkTargets(context: Context): Promise<rtextProtocol.LinkTargetsResponse> {
        return this.send({ command: "link_targets", context: context.lines, column: context.pos });
    }

    public findElements(pattern: string): Promise<rtextProtocol.FindElementsResponse> {
        return this.send({ command: "find_elements", pattern: pattern });
    }

    public stop() {
        if (this._reconnectTimeout)
            clearTimeout(this._reconnectTimeout);
        this.stopService();
        if (this._rtextService) {
            this._rtextService.process!.kill();
        }
        if (this._keepAliveTask) {
            clearInterval(this._keepAliveTask);
        }
    }

    public loadModel(progressCallback?: Function): Promise<rtextProtocol.LoadModelResponse> {
        return this.send({ command: "load_model" }, progressCallback);
    }

    public stopService() {
        this.send({ command: "stop" });
    }

    public getVersion(): Promise<rtextProtocol.VersionResponse> {
        return this.send({ command: "version" });
    }

    public send(data: any, progressCallback?: Function | undefined): Promise<any> {
        if (!this._connected) {
            return Promise.reject();
        }

        data.type = "request";
        data.version = 1;
        data.invocation_id = this._invocationCounter;

        const request = new PendingRequest();
        request.invocationId = this._invocationCounter;
        request.progressCallback = progressCallback;
        request.command = data.command;
        this._pendingRequests.push(request);

        const payload = Message.serialize(data);

        this._client.write(payload);
        this._invocationCounter++;

        return new Promise<any>((resolve, reject) => {
            request.resolveFunc = resolve;
        });
    }

    private onError(error: Error) {
        console.log("Connection error: " + error.message);
    }

    private onConnect() {
        this._connected = true;
        console.log("Connected");
        this.loadModel();
    }

    private onClose() {
        this._connected = false;
        console.log("Connection closed");

        this._reconnectTimeout = setTimeout(() => {
            this._client.connect(this._rtextService?.port!, "127.0.0.1", () => this.onConnect());
        }, 1000);
    }

    private onData(data: any) {
        this._responseData = Buffer.concat([this._responseData, data], this._responseData.length + data.length);
        let obj: any;
        while (obj = Message.extract(this._responseData)) {
            this._responseData = this._responseData.slice(obj._dataLength);
            console.log("Received: " + JSON.stringify(obj));

            const found = this._pendingRequests.findIndex((request) => {
                return request.invocationId === obj.invocation_id;
            });

            if (found !== -1) {
                const pending = this._pendingRequests[found];
                if (obj.type === "response") {
                    if (pending.resolveFunc) {
                        pending.resolveFunc(obj);
                    }
                    this._pendingRequests.splice(found, 1);
                } else if (obj.type === "progress" &&
                    pending.progressCallback) {
                    pending.progressCallback!(obj);
                } else if (obj.type === "unknown_command_error") {
                    console.log("Error: unknown command - " + obj.command);
                    this._pendingRequests.splice(found, 1);
                } else if (obj.type === "unsupported_version") {
                    console.log("Error: unsupported version " + obj.version);
                    this._pendingRequests.splice(found, 1);
                }
            }
        }
    }

    private transformCommand(command: string): string {
        let m = command.match(/^cmd\s*\/c\s*/);
        if (m && os.platform() !== 'win32') {
            command = command.substring(m[0].length);
        }
        else if (!m && os.platform() === 'win32') {
            command = "cmd \/c " + command;
        }
        return command;
    }

    private async runRTextService(config: ServiceConfig): Promise<RTextService> {
        const rtextService: RTextService = {
            config: config
        };
        return new Promise<RTextService>((resolve, reject) => {
            const configCommand = this.transformCommand(config.command.trim());
            const command = configCommand.split(' ')[0];
            const args = configCommand.split(' ').slice(1);
            let cwd = path.dirname(config.file);
            console.log(`Run ${configCommand}`);
            let proc = child_process.spawn(command, args, { cwd: cwd, shell: process.platform === 'win32' });
            proc.on('error', (error) => {
                reject(error);
            });
            proc.stdout.on('data', (data: any) => {
                const stdout: string = data.toString();
                console.log(stdout);
                const foundPort = stdout.match(/.*listening on port (\d*)/);
                if (foundPort) {
                    rtextService.port = parseInt(foundPort[1]);
                    rtextService.process = proc;
                    resolve(rtextService);
                }
            });
        });
    }
}
