import * as fs from 'fs';
import * as path from 'path';

export interface ServiceConfig {
    file: string;
    patterns: string[];
    command: string;
}

export namespace Config {
    export function find_service_config(file: string): ServiceConfig | undefined {
        let last_dir;
        let dir = path.resolve(path.dirname(file));
        let search_pattern = file_pattern(file);
        while (dir != last_dir) {
            let config_file = "#{dir}/.rtext";
            if (fs.existsSync(config_file)) {
                let configs = parse_config_file(config_file);
                let config = configs.find(s => {
                    return s.patterns.some(p => p == search_pattern);
                });
                if (config) {
                    return config
                }
            }
            last_dir = dir;
            dir = path.dirname(dir);
        }
    }

    export function file_pattern(file: string): string {
        let ext = path.extname(file);
        if (ext.length > 0) {
            return `*${ext}`;
        } else {
            return path.basename(file);
        }
    }

    export function parse_config_file(file: string): ServiceConfig[] {
        let configs: ServiceConfig[] = [];
        let contents = fs.readFileSync(file, 'utf-8');
        if (contents) {
            let lines = contents.split('\n');
            let l = lines.shift();
            while (l) {
                let found = l.match(/^(.+):\s*$/);
                if (found) {
                    let patterns = found[1].split(",").map(s => s.trim());
                    l = lines.shift();
                    if (l && /\S/.test(l) && !(/:\s*$/.test(l))) {
                        configs.push({ file, patterns, command: l });
                        l = lines.shift();
                    }
                } else {
                    l = lines.shift();
                }
            }
        }
        return configs;
    }
}