const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');

let depth = 0;
const stack = [];
const regex = /<div|<\/div>/gi;
let match;
while ((match = regex.exec(content)) !== null) {
    const pos = match.index;
    const lineNumber = content.substring(0, pos).split('\n').length;

    if (match[0].toLowerCase() === '<div') {
        depth++;
        stack.push({ line: lineNumber, pos: pos, id: (content.substring(pos, pos + 100).match(/id=["']([^"']+)["']/) || [])[1] });
    } else {
        const last = stack.pop();
        depth--;
    }

    const lineContent = content.substring(pos, content.indexOf('\n', pos));
    if (lineContent.includes('id="tab-main"')) console.log(`Line ${lineNumber}: tab-main depth ${depth}`);
    if (lineContent.includes('id="tab-schedule"')) console.log(`Line ${lineNumber}: tab-schedule depth ${depth}`);
    if (lineContent.includes('id="continuous-settings-modal"')) console.log(`Line ${lineNumber}: continuous-settings-modal depth ${depth}`);
    if (lineContent.includes('id="calendar-date-modal"')) console.log(`Line ${lineNumber}: calendar-date-modal depth ${depth}`);
}

console.log(`Final depth: ${depth}`);
