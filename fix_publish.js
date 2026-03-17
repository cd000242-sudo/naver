const fs = require('fs');
const path = require('path');

// Fix publishHelpers.ts remaining errors
const helperPath = path.join(__dirname, 'src', 'automation', 'publishHelpers.ts');
let helperLines = fs.readFileSync(helperPath, 'utf-8').split('\n');
let fixes = 0;

for (let i = 0; i < helperLines.length; i++) {
    const l = helperLines[i];

    // Fix 1: PublishMode type definition - was wrong values
    if (l.includes('type PublishMode') && l.includes('"공개"')) {
        helperLines[i] = "type PublishMode = 'draft' | 'publish' | 'schedule';";
        fixes++;
        console.log(`  L${i + 1}: Fixed PublishMode type`);
    }

    // Fix 2: calendarDateSet possibly null (L681)
    if (l.includes('calendarDateSet.monthDiff') && !l.includes('calendarDateSet!.') && !l.includes('calendarDateSet?.')) {
        helperLines[i] = l.replace('calendarDateSet.monthDiff', 'calendarDateSet!.monthDiff');
        fixes++;
        console.log(`  L${i + 1}: Fixed calendarDateSet null check`);
    }

    // Fix 3: catch (error) without type annotation (L1341)
    if (l.match(/\.catch\(\(error\)\s*=>/) || l.match(/\.catch\(error\s*=>/)) {
        helperLines[i] = l.replace(/\.catch\(\(error\)/, '.catch((error: any)').replace(/\.catch\(error =>/, '.catch((error: any) =>');
        fixes++;
        console.log(`  L${i + 1}: Fixed error implicit any`);
    }

    // Also fix .catch((error) without : any
    if (l.includes('.catch((error)') && !l.includes(': any')) {
        helperLines[i] = l.replace('.catch((error)', '.catch((error: any)');
        fixes++;
        console.log(`  L${i + 1}: Fixed error implicit any (pattern 2)`);
    }
}

fs.writeFileSync(helperPath, helperLines.join('\n'), 'utf-8');
console.log(`\nApplied ${fixes} fixes`);
