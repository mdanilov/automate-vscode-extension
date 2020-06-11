import * as fs from 'fs';
import * as crypto from 'crypto';

import { Config, ServiceConfig } from './config'
import { config } from 'process';

export interface ConnectorConstructor {
    new (config: ServiceConfig, data?: any): ConnectorInterface
}

export interface ConnectorInterface {
    readonly config: ServiceConfig;

    stop(): void;
}

interface ConnectorDesc {
    connector: ConnectorInterface;
    checksum?: string;
}

export class ConnectorManager {
    private _connectorDescs: Map<string, ConnectorDesc> = new Map();
    private _connectorCtor: ConnectorConstructor;

    constructor(ctor: ConnectorConstructor) {
        this._connectorCtor = ctor;
    }

    public connectorForFile(file: string, data?: any): ConnectorInterface | undefined {
        let config = Config.find_service_config(file);
        if (config) {
            let filePattern = Config.file_pattern(file);
            let key = this.descKey(config, filePattern);
            let desc = this._connectorDescs.get(key);
            if (desc) {
                if (desc.checksum == this.configChecksum(config)) {
                    return desc.connector;
                } else {
                    desc.connector.stop();
                    return this.createConnector(config, filePattern, data);
                }
            } else {
                return this.createConnector(config, filePattern, data);
            }
        }
    }

    public allConnectors(): ConnectorInterface[] {
        let cons: ConnectorInterface[] = [];
        this._connectorDescs.forEach((desc: ConnectorDesc) => {
            cons.push(desc.connector);
        });
        return cons;
    }

    private createConnector(config: ServiceConfig, pattern: string, data?: any): ConnectorInterface {
        let key = this.descKey(config, pattern);
        let con = new this._connectorCtor(config, data);
        let desc: ConnectorDesc = { connector: con, checksum: this.configChecksum(config) };
        this._connectorDescs.set(key, desc);
        return desc.connector;
    }

    private descKey(config: ServiceConfig, pattern: string): string {
        return config.file.toLowerCase() + ',' + pattern;
    }

    private configChecksum(config: ServiceConfig): string | undefined {
        if (fs.existsSync(config.file)) {
            let sha1 = crypto.createHash('sha1');
            sha1.update(fs.readFileSync(config.file));
            return sha1.digest('hex');
        }
    }
}
