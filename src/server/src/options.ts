import { ServiceConfig } from "./rtext/config"

export interface ServerInitializationOptions {
    hoverProvider?: boolean;
    command: string;
    args?: string[];
    rtextConfig: ServiceConfig;
}