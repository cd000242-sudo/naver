const fs = require('fs');
const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

let depth = 0;
for (let i = 6840; i < 6950; i++) {
    const line = lines[i];
    const opens = (line.match(/<div(\s|>)/gi) || []).length;
    const closes = (line.match(/<\/div>/gi) || []).length;
    depth += opens - closes;
    console.log(`Line ${i + 1}: Opens ${opens}, Closes ${closes}, Depth ${depth}, Content: ${line.trim().substring(0, 100)}`);
}
