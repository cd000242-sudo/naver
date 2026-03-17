/**
 * Detailed signature extraction - output JSON for delegate mapping
 */
const fs = require('fs');

function extractSigs(filePath, pattern) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const results = [];

    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(pattern);
        if (!m) continue;

        const funcName = m[m.length - 1]; // last capture group is the name

        // Extract params
        let paramStr = '';
        let parenCount = 0;
        let started = false;
        let done = false;
        for (let j = i; j < Math.min(i + 15, lines.length) && !done; j++) {
            for (let k = 0; k < lines[j].length && !done; k++) {
                const ch = lines[j][k];
                if (ch === '(') { parenCount++; started = true; }
                else if (ch === ')') { parenCount--; if (started && parenCount === 0) { paramStr += ')'; done = true; } }
                if (started) paramStr += ch;
            }
            if (!done) paramStr += ' ';
        }

        // Parse params
        const inner = paramStr.replace(/^\(/, '').replace(/\)$/, '');
        const params = [];
        let depth = 0;
        let current = '';
        for (const ch of inner) {
            if (ch === '(' || ch === '<' || ch === '{' || ch === '[') depth++;
            if (ch === ')' || ch === '>' || ch === '}' || ch === ']') depth--;
            if (ch === ',' && depth === 0) {
                params.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) params.push(current.trim());

        // Find body end
        let braceCount = 0, startFound = false, endLine = -1;
        for (let j = i; j < lines.length; j++) {
            for (const ch of lines[j]) {
                if (ch === '{') { braceCount++; startFound = true; }
                if (ch === '}') { braceCount--; if (startFound && braceCount === 0) { endLine = j; break; } }
            }
            if (endLine >= 0) break;
        }

        const paramNames = params.map(p => {
            const name = p.split(':')[0].split('?')[0].trim();
            return name;
        });

        results.push({
            name: funcName,
            line: i + 1,
            endLine: endLine + 1,
            bodySize: endLine - i + 1,
            params: paramNames,
            fullParams: params
        });
    }
    return results;
}

// imageHelpers exports
const helperSigs = extractSigs('src/automation/imageHelpers.ts', /export\s+(?:async\s+)?function\s+(\w+)\s*\(/);
console.log('=== imageHelpers EXPORTS ===');
helperSigs.forEach(s => {
    console.log(`${s.name}(${s.params.join(', ')})  [L${s.line}]`);
});

// main file methods
const targetMethods = [
    'applyCaption', 'setImageSizeToDocumentWidth', 'verifyImagePlacement',
    'insertImageViaUploadButton', 'insertBase64ImageAtCursor', 'insertImageViaBase64',
    'insertSingleImage', 'insertImagesAtCurrentCursor', 'setImageSizeAndAttachLink',
    'attachLinkToLastImage', 'insertImages', 'insertImagesAtHeadings', 'generateAltWithSource'
];

const mainContent = fs.readFileSync('src/naverBlogAutomation.ts', 'utf-8');
const mainLines = mainContent.split('\n');

console.log('\n=== MAIN FILE METHODS ===');
targetMethods.forEach(methodName => {
    for (let i = 0; i < mainLines.length; i++) {
        const line = mainLines[i];
        // Match as class method
        const re = new RegExp(`(?:private|public|protected)?\\s*(?:async\\s+)?${methodName}\\s*\\(`);
        if (re.test(line) && !line.includes('imageHelpers.') && !line.includes('//')) {
            // Extract params
            let paramStr = '';
            let parenCount = 0;
            let started = false;
            let done = false;
            for (let j = i; j < Math.min(i + 10, mainLines.length) && !done; j++) {
                for (let k = 0; k < mainLines[j].length && !done; k++) {
                    const ch = mainLines[j][k];
                    if (ch === '(') { parenCount++; started = true; }
                    else if (ch === ')') { parenCount--; if (started && parenCount === 0) { paramStr += ')'; done = true; } }
                    if (started) paramStr += ch;
                }
                if (!done) paramStr += ' ';
            }

            const inner = paramStr.replace(/^\(/, '').replace(/\)$/, '');
            const params = [];
            let depth = 0;
            let current = '';
            for (const ch of inner) {
                if (ch === '(' || ch === '<' || ch === '{' || ch === '[') depth++;
                if (ch === ')' || ch === '>' || ch === '}' || ch === ']') depth--;
                if (ch === ',' && depth === 0) {
                    params.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
            if (current.trim()) params.push(current.trim());

            const paramNames = params.map(p => p.split(':')[0].split('?')[0].trim());

            // Find body end
            let braceCount2 = 0, startFound2 = false, endLine2 = -1;
            for (let j = i; j < mainLines.length; j++) {
                for (const ch of mainLines[j]) {
                    if (ch === '{') { braceCount2++; startFound2 = true; }
                    if (ch === '}') { braceCount2--; if (startFound2 && braceCount2 === 0) { endLine2 = j; break; } }
                }
                if (endLine2 >= 0) break;
            }

            console.log(`${methodName}(${paramNames.join(', ')}) → L${i + 1}-L${endLine2 + 1} (${endLine2 - i + 1}lines)`);

            // Match with helper
            const helper = helperSigs.find(h => h.name === methodName);
            if (helper) {
                const helperParamsWithoutSelf = helper.params.slice(1); // Remove 'self'
                console.log(`  HELPER: ${methodName}(self, ${helperParamsWithoutSelf.join(', ')})`);
                console.log(`  DELEGATE: return await imageHelpers.${methodName}(this, ${paramNames.join(', ')});`);
            } else {
                console.log(`  ⚠️ NO MATCHING HELPER EXPORT`);
            }
            break;
        }
    }
});
