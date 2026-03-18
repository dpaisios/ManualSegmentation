// -------------------------------------------------------------
// parse_data.js
// Robust TXT / CSV → array of objects
// -------------------------------------------------------------

function isNumeric(v) {
    return v !== "" && !isNaN(Number(v));
}

function detectDelimiter(line) {
    if (line.includes(",")) return ",";
    if (line.includes("\t")) return "\t";
    return /\s+/;
}

function splitLine(line, delimiter) {
    if (delimiter instanceof RegExp) {
        return line
            .trim()
            .split(delimiter)
            .filter(v => v.length > 0);
    }

    return line.split(delimiter).map(s => s.trim());
}

export function parseData(rawText, fileName) {
    const ext = fileName.split(".").pop().toLowerCase();

    if (ext === "json") {
        return JSON.parse(rawText);
    }

    const lines = rawText
        .trim()
        .split(/\r?\n/)
        .filter(l => l.trim().length > 0);

    if (!lines.length) return [];

    const delimiter = detectDelimiter(lines[0]);

    const first = splitLine(lines[0], delimiter);
    const second = lines.length > 1 ? splitLine(lines[1], delimiter) : [];

    function countNumeric(arr){
        let n = 0;
        for(const v of arr){
            if(isNumeric(v)) n++;
        }
        return n;
    }

    const n1 = countNumeric(first);
    const n2 = countNumeric(second);

    // Header only if second row is more numeric than first
    const hasHeader =
        second.length === first.length &&
        n2 > n1;

    let header, startRow;

    if (hasHeader) {
        header = first;
        startRow = 1;
    } else {
        header = first.map((_, i) => `V${i + 1}`);
        startRow = 0;
    }

    return lines.slice(startRow).map(line => {
        const values = splitLine(line, delimiter);
        const obj = {};
        for (let i = 0; i < header.length; i++) {
            obj[header[i]] = values[i];
        }
        return obj;
    });
}