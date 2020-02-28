export namespace Message {

    export function serialize(obj: object) {
        escapeAllString(obj);
        const json = JSON.stringify(obj);
        return json.length + json;
    }

    export function extract(data: any): any | undefined {
        const str = data.toString("binary");
        const m = str.match(/^(\d+)\{/);
        let obj;
        if (m) {
            const lengthLength = m[1].length;
            const length = Number(m[1]);
            if (str.length >= lengthLength + length) {
                const json = str.slice(lengthLength, lengthLength + length);
                obj = JSON.parse(json);
                obj._dataLength = lengthLength + length;
            }
        }
        if (obj) {
            unescapeAllStrings(obj);
        }
        return obj;
    }

    function unescapeAllStrings(obj: object) {
        forEachNested(Object.values(obj), (s) => {
            // change encoding back to binary
            // there could still be replacement characters (\uFFFD), turn them into "?"
            s.replace(/%[0-9a-fA-F][0-9a-fA-F]/, (x: string) => {
                return String.fromCharCode(parseInt(s.slice(1, 2), 16));
            });
        }, null);
    }

    function escapeAllString(obj: object) {
        forEachNested(Object.values(obj), (value) => {
            const bytes = Buffer.from(value);
            value = "";
            bytes.forEach((b) => {
                if (b >= 128 || b == 0x25) { // %
                    value.concat(`%${b.toString(16)}`);
                }
                else {
                    value.concat(b);
                }
            });
        }, null);
    }

    function forEachNested(O: any, f: (value: any) => void, cur: any) {
        O = [ O ]; // ensure that f is called with the top-level object
        while (O.length) // keep on processing the top item on the stack
            cur = O.pop();
            cur.forEach((p: any) => {
                if (typeof p === 'string') {
                    f(p);
                }
            });
            if(
               cur instanceof Object && // ensure cur is an object, but not null
               [Object, Array].includes(cur.constructor) //limit search to [] and {}
            ) O.push.apply(O, Object.values(cur)); //search all values deeper inside
    }
}